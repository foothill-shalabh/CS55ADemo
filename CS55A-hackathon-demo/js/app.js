//webkitURL is deprecated but nevertheless
URL = window.URL || window.webkitURL;

// Insert your Cognito and AWS credentials here

var AWS_BucketName = "sagarwal10-test";
var AWS_BucketRegion = "us-west-2";
var AWS_CognitoPoolId = "us-west-2:b2ce8f88-4838-4a35-81f4-913d524089d6";

var gumStream; //stream from getUserMedia()
var recorder; //WebAudioRecorder object
var input; //MediaStreamAudioSourceNode  we'll be recording
var encodingType;	//holds selected encoding for resulting audio (file)
var encodeAfterRecord = true;       // when to encode

// shim for AudioContext when it's not avb. 
var AudioContext = window.AudioContext || window.webkitAudioContext;
var audioContext; //new audio context to help us record

var encodingTypeSelect = document.getElementById("encodingTypeSelect");
var recordButton = document.getElementById("recordButton");
var stopButton = document.getElementById("stopButton");
var log = document.getElementById("log"); 

//add events to those 2 buttons
recordButton.addEventListener("click", startRecording);
stopButton.addEventListener("click", stopRecording);

  var albumBucketName = AWS_BucketName;
  var bucketRegion = AWS_BucketRegion;
  var IdentityPoolId = AWS_CognitoPoolId;

  AWS.config.update({
    region: bucketRegion,
    credentials: new AWS.CognitoIdentityCredentials({
      IdentityPoolId: IdentityPoolId
    })
  });

  var s3 = new AWS.S3({
    apiVersion: "2006-03-01",
    params: { Bucket: albumBucketName }
  });

  /*
   * CS55A students - the following section is only for debug - it
   * lists the contents of the S3 bucket where audio files will be
   * uploaded. It is only for debug to ensure that your Cognito
   * credentials are correct and that the API is working.
   * Only uncomment this section to debug and see a listing of the 
   * contents of your bucket
   *
  console.log("Using following S3 bucket");
  console.log(s3);
  s3.listObjects({ Delimiter: "/" }, function(err, data) {
    if (err) {
      console.log("There was an error listing your albums: " + err.message);
    } else {
        data.CommonPrefixes.map(function(commonPrefix) {
        var prefix = commonPrefix.Prefix;
        var albumName = decodeURIComponent(prefix.replace("/", ""));
        console.log(albumName);

        var albumPhotosKey = encodeURIComponent(albumName) + "//";
        s3.listObjects({ Prefix: albumPhotosKey }, function(err, data) {
          if (err) {
             console.log("There was an error viewing your album: " + err.message);
          }
          console.log(data);
          var photos = data.Contents.map(function(photo) {
            console.log(photos);
          });
        })
     })
   }});

   *
   */


function startRecording() {
    console.log("startRecording() called");
    __log("Starting Recording...");
	/*
	Simple constraints object, for more advanced features see
	https://addpipe.com/blog/audio-constraints-getusermedia/
	*/
    
    var constraints = { audio: true, video:false }

    /*
   We're using the standard promise based getUserMedia() 
   https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
   */
    navigator.mediaDevices.getUserMedia(constraints);
	navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
		console.log("Got user media access permission");
		__log("User microphone access permission granted, initializing WebAudioRecorder...");

	/*
	create an audio context after getUserMedia is called
	sampleRate might change after getUserMedia is called, like it does on macOS when recording through AirPods
	the sampleRate defaults to the one set in your OS for your playback device

	*/
	audioContext = new AudioContext();

	//update the format 
	document.getElementById("formats").innerHTML="Format: 2 channel "+encodingTypeSelect.options[encodingTypeSelect.selectedIndex].value+" @ "+audioContext.sampleRate/1000+"kHz"

	//assign to gumStream for later use
	gumStream = stream;
		
	/* use the stream */
	input = audioContext.createMediaStreamSource(stream);
		
	//stop the input from playing back through the speakers
	//input.connect(audioContext.destination)

	//get the encoding 
	encodingType = encodingTypeSelect.options[encodingTypeSelect.selectedIndex].value;
	
	//disable the encoding selector
	encodingTypeSelect.disabled = true;

	recorder = new WebAudioRecorder(input, {
	  workerDir: "js/", // must end with slash
	  encoding: encodingType,
	  numChannels:2, //2 is the default, mp3 encoding supports only 2
		  onEncoderLoading: function(recorder, encoding) {
		    // show "loading encoder..." display
		    __log("Loading "+encoding+" encoder...");
		  },
		  onEncoderLoaded: function(recorder, encoding) {
		    // hide "loading encoder..." display
		    __log(encoding+" encoder loaded");
		  }
		});

		recorder.onComplete = function(recorder, blob) { 
			__log("Encoding complete");
			createDownloadLink(blob,recorder.encoding);
			encodingTypeSelect.disabled = false;
		}

		recorder.setOptions({
		  timeLimit:120,
		  encodeAfterRecord:encodeAfterRecord,
	      ogg: {quality: 0.5},
	      mp3: {bitRate: 160}
	    });

		//start the recording process
		recorder.startRecording();

		 __log("Recording started");

	}).catch(function(err) {
	  	//enable the record button if getUSerMedia() fails
        console.log("Unable to get audio recording permission");
	__log("Failed to get audio recording permission");
    	recordButton.disabled = false;
    	stopButton.disabled = true;

	});

	//disable the record button
    recordButton.disabled = true;
    stopButton.disabled = false;
}

function stopRecording() {
	console.log("stopRecording() called");
	
	//stop microphone access
	// gumStream.getAudioTracks()[0].stop();

	//disable the stop button
	stopButton.disabled = true;
	recordButton.disabled = false;
	
	//tell the recorder to finish the recording (stop recording + encode the recorded audio)
	recorder.finishRecording();

	__log('Recording stopped');
}

function createDownloadLink(blob,encoding) {
	
      var fileKey = encodeURIComponent("soundfiles")+"/"+"audio"+Date.now().toString()+".mp3";
      var params = {
        Bucket: albumBucketName,
        Key: fileKey,
        Body: blob,
        ContentLength: blob.size
      };

      console.log(params);
      __log("Uploading Audio file "+fileKey+"to S3");
      var upload = s3.upload(params, function(err, data) {
        if (data) {
          console.log("Successfully uploaded"+data);
        } else {
          console.log("Error "+err.message);
        }

      __log("Transcribing and Translating using AWS lambda Function.....");
      __log("Please wait upto 4 minutes.......");
console.log("Invoking lambda");
      var lambda = new AWS.Lambda();
      var params =  {
        FunctionName: 'localAudio2Text',
        InvocationType: 'RequestResponse',
        LogType: 'Tail',
        Payload: '{ "s3audioFile" : "'+"s3://sagarwal10-test/"+fileKey+'"}'
      };

  console.log("Params is ");
  console.log(params);
  lambda.invoke(params, function(err, data) {
    if (err) {
      console.log(err);
      __log("Transcription Failed - " + data.Payload);
    } else {
      console.log('Lambda function response: '+ data.Payload);
      __log("Transcription Complete!");
     document.getElementById("audioLink").src = "https://sagarwal10-test.s3-us-west-2.amazonaws.com/result.mp3";
     parent.document.getElementById("audioLink").reload();
    }
  })


      });


	var url = URL.createObjectURL(blob);
	var au = document.createElement('audio');
	var li = document.createElement('li');
	var link = document.createElement('a');

	//add controls to the <audio> element
	au.controls = true;
	au.src = url;

	//link the a element to the blob
	link.href = url;
	link.download = new Date().toISOString() + '.'+encoding;
	link.innerHTML = link.download;

	//add the new audio and a elements to the li element
	li.appendChild(au);
	li.appendChild(link);

	//add the li element to the ordered list
	// recordingsList.appendChild(li);
}



//helper function
function __log(e, data) {
	log.innerHTML += "\n" + e + " " + (data || '');
}
