import json
import time
import boto3
import datetime
import urllib.request
from boto3 import Session
from botocore.exceptions import BotoCoreError, ClientError
from contextlib import closing


def lambda_handler(event, context):
  print(event)
  print(context)

  body = event
  print(body['s3audioFile'])
  now = str(datetime.datetime.now())
  now = now.split('.')[0].replace(' ','_').replace('-', '_').replace(':','_')
  print(now)

  # Insert your AWS credentials in the next three lines
  AWS_ACCESS_KEY_ID = ''
  AWS_SECRET_ACCESS_KEY = ''
  AWS_REGION_NAME = 'us-west-1'
  
  transcribe = boto3.client('transcribe', region_name=AWS_REGION_NAME, 
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY)

  job_name = "jobname"+now
  job_uri = body['s3audioFile']
  print("JOB URI is "+ job_uri)

  transcribe.start_transcription_job(
    TranscriptionJobName=job_name,
    Media={'MediaFileUri': job_uri},
    # MediaFormat='wav',
    MediaFormat='mp3',
    LanguageCode='en-US'
  )
  while True:
    status = transcribe.get_transcription_job(TranscriptionJobName=job_name)
    if status['TranscriptionJob']['TranscriptionJobStatus'] in ['COMPLETED', 'FAILED']:
        break
    print("Not ready yet...")
    time.sleep(5)

  print('================ END OF CODE ==================\n\n')
  print(status)
  url = status['TranscriptionJob']['Transcript']['TranscriptFileUri']

  import urllib.request
  cont = urllib.request.urlopen(url).read()
  text = cont.decode()
  result  = json.loads(text)

  result = result['results']['transcripts'][0]['transcript']
  print(result)

  translate = boto3.client(service_name='translate', region_name=AWS_REGION_NAME, 
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY, use_ssl=True)

  languages = ['en','ar', 'es', 'zh', 'hi']
  voiceIds  = {'en':'Joanna','ar':'Zeina', 'es':'Mia', 'zh':'Zhiyu', 'hi':'Aditi'}
  langs     = {'en':'English','ar':'Arabic', 'es':'Spanish', 'zh':'Chinese', 'hi':'Hindi'}

# List of languages: https://docs.aws.amazon.com/translate/latest/dg/what-is.html
  all_results = {}
  for language in languages:
    print('Hello there! ')
    translation = translate.translate_text(Text=result,  SourceLanguageCode="en", TargetLanguageCode=language)
    print('TranslatedText: ' + translation.get('TranslatedText'))
    print('SourceLanguageCode: ' + translation.get('SourceLanguageCode'))
    print('TargetLanguageCode: ' + translation.get('TargetLanguageCode'))
    all_results[language] = translation.get('TranslatedText')

  for key in all_results.keys():
    print(key, ':  ',all_results[key])

# Create a client using the credentials and region defined in the [adminuser]
# section of the AWS credentials file (~/.aws/credentials).
  session = Session(region_name=AWS_REGION_NAME, 
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY)
        
  polly = session.client("polly" )

  response = {}
  pauser   = {}
  try:
    # Request speech synthesis
    for lan in languages:
        response[lan] = polly.synthesize_speech(
                Text=all_results[lan], 
                OutputFormat="mp3",
                VoiceId=voiceIds[lan]
            )
        # Now we need the breaker
        if lan=='en':
            pause_Text = 'The original Text is'
        else:
            pause_Text = 'Now, Translation in {}'.format(langs[lan])
        pauser[lan] = polly.synthesize_speech(Text=pause_Text,
                OutputFormat='mp3',
                VoiceId='Joanna'
                )
  except (BotoCoreError, ClientError) as error:
    # The service returned an error, exit gracefully
    print(error)
    sys.exit(-1)

  # Access the audio stream from the response
  idx = 0
  # output = os.path.join(gettempdir(), "speech.mp3")
  output="/tmp/result.mp3"
  file= open(output, "wb")

  for lan in languages:
    if "AudioStream" in response[lan]:
        # Note: Closing the stream is important because the service throttles on the
        # number of parallel connections. Here we are using contextlib.closing to
        # ensure the close method of the stream object will be called automatically
        # at the end of the with statement's scope.
        print('=============Found the AudioStream in response===========')
        with closing(response[lan]["AudioStream"]) as stream:
            print('\n========I am in the streamer ===========\n')
            #output = os.path.join(gettempdir(), "speech.mp3")

            try:
                # Open a file for writing the output as a binary stream
                #with open(output, "wb") as file:
                file.write(pauser[lan]['AudioStream'].read())
                file.write(stream.read())
            except IOError as error:
                # Could not write to file, exit gracefully
                print(error)
                sys.exit(-1)

    else:
        # The response didn't contain audio data, exit gracefully
        print("Could not stream audio")
        sys.exit(-1)
  file.close()

  # Play the audio using the platform's default player
  # if sys.platform == "win32":
  #  os.startfile(output)
  # else:
    # The following works on macOS and Linux. (Darwin = mac, xdg-open = linux).
  #  opener = "open" if sys.platform == "darwin" else "xdg-open"
  #  subprocess.call([opener, output])

#====================================================================
# Here we need to save the output file into s3
#
#
  t1 = datetime.datetime.now()
  S3 = boto3.client('s3', region_name=AWS_REGION_NAME,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY)
        
  # os.system('mv /tmp/speech.mp3 result.mp3')

  SOURCE_FILENAME = '/tmp/result.mp3'
  BUCKET_NAME = 'sagarwal10-test'

# Uploads the given file using a managed uploader, which will split up large
# files automatically and upload parts in parallel.
  S3.upload_file(SOURCE_FILENAME, BUCKET_NAME, "result.mp3", ExtraArgs={'ACL':'public-read'})

  t2 = datetime.datetime.now()

  # print('Time to push to S3 is {}'.format(t2-t1))
  # print('Entire process to execute: {}'.format(t2-t0))

  return {
        'statusCode': 200,
        'body': result
  }

