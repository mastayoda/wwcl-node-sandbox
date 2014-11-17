  var io = require('socket.io-client');
  var external_address = require('external-address');
  
  var sys = require('sys')
  var exec = require('child_process').exec;
  

  /* Get Machine External Address (Public IP) */
  external_address.lookup(function(error, address) {

      /* Initializing timer */
      var timeTimer     = new Date().getTime();
      
      /* All pipes in Topology */
      var pipeSockets   = [];
      
      
      /* Handling ping request */
      var ping          = require("net-ping");
      var isClient      = 0;
      
      /* Some globals */
      var strServer     = 'https://wwcl-server-mastayoda1.c9.io';
      
      /* Scheduling taks */
      var schedule = require('node-schedule');
      var rule = new schedule.RecurrenceRule();
	    rule.minute = null;
	    
      /* Executing code */
      var SandCastle = require('sandcastle').SandCastle;
      var sandcastle = new SandCastle();

      console.log("Init timer: " + timeTimer);

      var sysInfo = dumpSystemInfo(address);

      var socket = io.connect(strServer, {
          query: 'isClient=' + isClient + '&' + 'sysInfo=' + JSON.stringify(sysInfo) 
      });

      var pipeArray = [];

      /* Connection succeed */
      socket.on('connect', function() {

          /* Disconnect handler */
          socket.on('disconnect', function() {
              
              console.log("Disconnected")
              
          });

          /* New Pipe Connected handler */
          socket.on('sandboxConnected', function(pipeInfo) {
              
              var pipe = JSON.parse(pipeInfo);
              
              pipeArray[pipe.id] = pipe;

              console.log("New SandBox!", pipe);
          });

          /* New Pipe Disconnected handler */
          socket.on('sandboxDisconnected', function(id) {

              pipeArray.splice(pipeArray.indexOf(id), 1);

              console.log("SandBox " + id + " disconnected!");

          });

          /* Receive pipeListing Handler */
          socket.on('reponseSandBoxListing', function(data) {

              var connectedPipes = JSON.parse(data);
              connectedPipes.forEach(function(pipe) {
                  pipeArray[pipe.id] = pipe;
              });

              console.log(connectedPipes.length + " sandboxes connected!");

          });/*END Receive sandboxListing Handler */
          
          /* RTT test */
          socket.on('sandboxRTT', function(socket) {

              console.log("Sandbox RTT test" );
             
              function puts(error, stdout, stderr) { sys.puts(stdout) }
              exec("ping -c 10 localhost", puts);

          });/*END RTT test */
          
           /* Scheduler */
          socket.on('sandboxExecuteSchedule', function(data) {

              console.log("Sandbox Received Execute Schedule: " + data);

          });/*END Scheduler */
          
          /* Initiate Sending Process and Data Collection */
          socket.on('sandboxStartSend', function(data) {

              console.log("Sandbox Start Sending Data: " + data);

          });/*END Initiate Sending Process and Data Collection */

          /* Deploy Topology */
          socket.on('sandboxDeployTopology', function(data) {

              console.log("Sandbox Received Deploy Topology: " + data);

          });/*END Deploy Topology */
          
          /*Receiving Schedule Data from Server Ping-Pong */
          socket.on('sandboxReceiveScheduleData', function(packet) {
              var localPacket = JSON.parse(packet);
              console.log("Sandbox Received Data Packet from Server: " + localPacket.payload);
              
              var Pool = require('sandcastle').Pool;
              
              var poolOfSandcastles = new Pool( { numberOfInstances: 1 }, { timeout: 6000 } );
              
              var script = poolOfSandcastles.createScript("\
                exports.main = function() {" + localPacket.payload +  "}\
              ");
      
              script.on('exit', function(err, output) {
                console.log(output); 
              });
              
              script.on('timeout', function() {
                console.log('timed out handler');
              });
      
              script.run();
          });//END Receiving Schedule Data from Server Ping-Pong
          
          var j = schedule.scheduleJob(rule, function(){
	        var localPacket = timerHandler();
	        socket.emit("sandboxSendScheduleData", JSON.stringify(localPacket));
	      });

          /* Request Sandbox listing */
          socket.emit("requestSandBoxListing");

      });/*END Connection succeed */


  });/* END Get Machine External Address (Public IP) */
  

  /* Trigger this function when timer */  
  function timerHandler() {  
    var packet = {};
    packet.payload = "var x=10; exit(x);";
  
    console.log('Sandbox Scheduled tasks triggered.');
    return packet;
  }
  
  /* Get Object with all system Specifications */
  function dumpSystemInfo(address) {

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
    specs.publicIP = address.replace('\n', '');
    specs.flops = 1;
    specs.isNodeJS = typeof exports !== 'undefined' && this.exports !== exports;

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

