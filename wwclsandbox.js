   var io = require('socket.io-client');
   var Parallel = require("paralleljs");
   /*Declaring Globals*/
   var runningJobs = [];
   var jobRunLimit = 300; /* 5 Minutes execution limit*/
   var socket = null;
   var seqFlops = calculateGigaFlopsSequential();
   var parFlops = 0;
   var RTT = "temp";


   function socketIOConnect() {

       /* Extracting browser's info */
       var sysInfo = dumpSystemInfo();

       /* Join World Wide Cluster */
       socket = io.connect("https://wwcl-server-mastayoda1.c9.io", {
           query: 'isClient=' + false + '&' + 'sysInfo=' + JSON.stringify(sysInfo)
       });

       /* Connection succeed */
       socket.on('connect', function() {

           /* Reconnect Event */
           socket.on('reconnect', function() {
               reconnect();
           });

           /* Disconnect handler */
           socket.on('disconnect', function() {

               disconnect();
           });

           /* Requesting Job Execution */
           socket.on('jobExecutionRequest', function(job) {

               jobExecutionRequest(job);
           });

           /* Receiving sandbox count re */
           socket.on('clusterStatusResponse', function(status) {

               clusterStatusResponse(status);

           });

           /* Receiving request for RTT */
           socket.on('sampleRTT', function(status) {

               socket.emit("sampleRTTResponse");

           });

           /* Requestion Cluster Status */
           socket.emit("clusterStatusRequest");

       });

   }

   /******************** SOCKET EVENTS ************************************/
   function reconnect() {


   }

   function disconnect() {


   }

   function jobExecutionRequest(job) {

       try {

           /* Parsing the code */
           var code = codeBuilder(job);

           /* Creating sandbox and executing */
           var p = new Parallel(code.data, {
               maxWorkers: 8
           });

           /* If a partitioned job*/
           if (job.jobCode.isPartitioned)
           /* Executing single Job*/
               p.map(code.kernel).then(execJobCallBack);
           else
           /* Executing Multiple threads upon mapped array Job*/
               p.spawn(code.kernel).then(execJobCallBack);

       } catch (e) {

           /* Error Ocurred */
           var error = {};
           error.error = e.toString();
           error.clientSocketId = job.clientSocketId;
           sendError(error);
       }
   }


   /* build kernel and data */
   function codeBuilder(job) {

       var params = eval(JSON.parse(job.jobCode.paramsAndData));

       if (job.jobCode.isPartitioned)
           var func = eval("a=function(params){result='result variable not set!';try{" + job.jobCode.kernelCode + "}catch(ex){result=ex.toString();}params.result = result;delete params.data;return params;}");
       else
           var func = eval("a=function(params){result='result variable not set!';try{" + job.jobCode.kernelCode + "}catch(ex){result=ex.toString();}params.result = result;return params;}");


       /* If a partitioned job, split array and assign data */
       if (job.jobCode.isPartitioned) {

           var paramArr = [];
           /* Adding first index */
           var indexCnt = job.jobCode.pRange[0];
           /* Building objects */
           for (var i = 0; i < params.length; i++) {
               var obj = {};
               obj.data = params[i];
               obj.index = indexCnt;
               obj.clientSocketId = job.clientSocketId;
               obj.jobId = job.jobId;

               paramArr.push(obj);
               indexCnt++;
           }
           return {
               "kernel": func,
               "data": paramArr
           };

       } else {

           var obj = {};
           obj.data = params;
           obj.clientSocketId = job.clientSocketId;
           obj.jobId = job.jobId;

           return {
               "kernel": func,
               "data": obj
           };
       }
   }

   function execJobCallBack(execResults) {

       /* if results from kernel function is undefined
        * something went terrible wrong, return */
       if (execResults == undefined) {
           /* Error Ocurred */
           var error = {};
           error.error = "Kernel function returned undefined.";
           error.clientSocketId = "NEED TO FIX THIS";
           sendError(error);
       }

       /* If map operation, clean results */
       if (execResults instanceof Array) {
           var mapRes = {};
           mapRes.clientSocketId = execResults[0].clientSocketId;
           mapRes.jobId = execResults[0].jobId;
           mapRes.result = [];

           for (var i = 0; i < execResults.length; i++) {
               /* Cleaning unnecesary properties */
               delete execResults[i].clientSocketId;
               /* Pushing data */
               mapRes.result.push(execResults[i]);
           }

           /* reseting results */
           execResults = mapRes;
       } else /* Spawn instance */ {
           delete execResults.sandboxSocketId;
           delete execResults.data;
       }

       /* returning reesuls */
       sendResults(execResults);
   }

   function clusterStatusResponse(status) {
       console.log(status);

   }

   /*************************** HELPER FUNCTIONS **********************************/
   /* Send Results Back when done */
   function sendResults(results) {
       socket.emit("jobDeploymentResponse", results);
   }

   function sendError(error) {
       socket.emit("jobDeploymentErrorResponse", error);
   }

   /* Get Object with all system Specifications */
   function dumpSystemInfo() {

       var os = require('os');
       var specs = {};

       specs.cpu = os.cpus()[0];
       delete specs.cpu.times;
       specs.cpu.cores = os.cpus().length;
       specs.arch = os.arch();
       specs.freemem = os.freemem();
       specs.hostname = os.hostname();
       specs.platform = os.platform();
       specs.totalmem = os.totalmem();
       specs.type = os.type();
       specs.uptime = os.uptime();
       specs.publicIP = getClientIP();
       specs.flops = calculateGigaFlopsSequential();
       specs.pFlops = specs.cpu.cores * specs.flops;
       specs.isNodeJS = true;

       var ifaces = os.networkInterfaces();
       var innterArr = [];
       var isBehindNat = true;

       for (var dev in ifaces) {
           ifaces[dev].forEach(function(details) {
               if (details.family == 'IPv4') {

                   /* Check if behind NAT */
                   if (specs.publicIP == details.address)
                       isBehindNat = false;

                   innterArr.push({
                       'dev': dev,
                       'address': details.address
                   });
               }
           });
       }
       specs.isBehindNAT = isBehindNat;
       specs.networkInterfaces = innterArr;
       return specs;
   }

   function getClientIP() {
        
       var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
       var xmlhttp = new XMLHttpRequest();

       xmlhttp.open("GET", "http://ip-api.com/json", false);
       xmlhttp.send();

       var hostipInfo = xmlhttp.responseText.split("\n");

       return JSON.parse(hostipInfo[0]).query;
   }


   function calculateGigaFlopsSequential() {

       var numeric = require("numeric");
       var bench = numeric.bench;
       var mkA = function(n) {
           return numeric.random([n, n]);
       };
       var mkV = function(n) {
           return numeric.random([n]);
       };
       var V = mkV(3000);
       var V1 = mkV(1000);
       var V2 = mkV(1000);
       var absBench = bench(function() {
           numeric.abs(V);
       });
       //console.log("absBench:" + absBench);
       var identityBench = bench(function() {
           numeric.identity(1000);
       });
       //console.log("identityBench:" + identityBench);
       var A = mkA(1000);
       var matrixTrans = bench(function() {
           numeric.transpose(A);
       });
       //console.log("matrixTrans:" + matrixTrans);
       var matrixVectorProduct = bench(function() {
           numeric.dot(A, V1);
       });
       //console.log("matrixVectorProduct:" + matrixVectorProduct);
       var vectorMatrixProduct = bench(function() {
           numeric.dot(V1, A);
       });
       //console.log("vectorMatrixProduct:" + vectorMatrixProduct);
       var linePlusSlope = bench(function() {
           numeric.addeq(numeric.dot(A, V1), V2);
       });
       // console.log("linePlusSlope:" + linePlusSlope);
       var A = mkA(100);
       var B = mkA(100);
       var matrixMatrixProduct = bench(function() {
           numeric.dot(A, B);
       });
       //console.log("matrixMatrixProduct:" + matrixMatrixProduct);
       var matrixMatrixSum = bench(function() {
           numeric.add(A, A);
       });
       //console.log("matrixMatrixSum:" + matrixMatrixSum);
       var matrixInverse = bench(function() {
           numeric.inv(A);
       });
       //console.log("matrixInverse:" + matrixInverse);
       var A = numeric.ccsScatter(numeric.cdelsq(numeric.cgrid(30)));
       var sparseLaplacian = bench(function() {
           numeric.ccsLUP(A);
       });
       //console.log("sparseLaplacian:" + sparseLaplacian);
       var A = numeric.cdelsq(numeric.cgrid(30));
       var bandedLaplacian = bench(function() {
           numeric.cLU(A);
       });
       //console.log("bandedLaplacian:" + bandedLaplacian);
       var geometricmeans = (absBench + identityBench + matrixTrans + matrixVectorProduct + vectorMatrixProduct + linePlusSlope + matrixMatrixProduct + matrixMatrixSum + matrixInverse + sparseLaplacian + bandedLaplacian) / 11000;

       return Number(geometricmeans.toFixed(2));
   }

   /*****************BenchMark Functions******************************************/
   function recordRTT(error, stdout, stderr) {
       RTT = "TEST";
   }


    /* Connect */
    socketIOConnect();