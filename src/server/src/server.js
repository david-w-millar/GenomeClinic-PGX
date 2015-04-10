/*
 * Webapp server for clinical pharmacogenomics analyis and variant visualization
 * 
 * @author Ron Ammar
 * @author Patrick Magee
 */
var express= require("express"),
	Promise= require("bluebird"),
	path = require("path"),
	fs = Promise.promisifyAll(require('fs')),
	passport = require('passport'),
	flash = require('connect-flash'),
	cookieParser = require('cookie-parser'),
	session = require('express-session'),
	bodyParser= require("body-parser"),
	mongoStore = require('connect-mongo')(session),
	https = require('https'),
	http = require('http'),
	morgan = require('morgan'),
	constants = require('./lib/conf/constants.json'),
	cons = require('consolidate');


var dbConstants = constants.dbConstants;
var nodeConstants = constants.nodeConstants;

//=======================================================================
// Command Line Options
//=======================================================================
/* Control the behaviour of the server by modifying the defaul
 * value of these command line options. They can be passed when
 * the server is initially started */
var opts= require("nomnom")
	.option("httpsPortNumber", {
		abbr: "S",
		full: "httpsport",
		default: 443,
		help: "User-specifed port number for https connection"
	})
	.option('httpPortNumber',{
		abbr:'p',
		full:"httpport",
		default:80,
		help:'specify the default port for incoming http connection'
	})
	.option("mongodbHost", {
		full: "mongodb-host",
		default: dbConstants.DB.HOST,
		help: "User-specifed MongoDB hostname",
		callback: function(mongodbHost) {
			dbConstants.DB.HOST= mongodbHost;
		}
	})
	.option("mongodbPortNumber", {
		full: "mongodb-port",
		default: dbConstants.DB.PORT,
		help: "User-specifed MongoDB port number",
		callback: function(mongodbPortNumber) {
			dbConstants.DB.PORT= parseInt(mongodbPortNumber);
		}
	})
	.option("gmail",{
		abr:'g',
		full: "gmail-account",
		default:undefined,
		help:"gmail account name to use for sending password recoveries. This will not be permanately stored",
	})
	.option('password',{
		abr:'W',
		full:'gmail-password',	
		default:undefined,
		help:'please eneter gmail account password. This will not be permanately stored',

	})
	.option('oauth',{
		flag:true,
		abr:'O',
		help:'Use Google Oauth for authentication',
	})
	.option('nosignup',{
		flag:true,
		help:'Use signup form'
	})
	.option('norecover',{
		flag:true,
		help:'Use recover form'
	})
	.option('https',{
		flag:true,
		help:"Use secure https connection"
	})
	.option('development',{
		abbr:'d',
		full:'dev',
		flag:true,
		help:'Set development environment to true and use localhost ports'
	})
	.option('crt',{
		abbr:'c',
		full:'crt',
		help:'Path to the crt file for https usage. Required if -https is used',
		default:undefined
	})
	.option('key',{
		abbr:'k',
		full:'key',
		help:'Pass in the key file for https usage. Required if -https is used',
		default:undefined
	})
	.parse();
opts.signup =  !opts.nosignup;
opts.recover = !opts.norecover;
if (opts.https && (! opts.crt || !opts.key)){
	console.log("--https opton provided, please provide a crt file and a key file");
	process.exit(1);
} else if (!opts.password && opts.gmail || opts.password && !opts.gmail){
	console.log("--password and --gmail must both be provided");
	process.exit(1);
}
//=======================================================================
//Make log Directories
//=======================================================================
var prerequisiteDirectories = ["upload", "tmp", nodeConstants.LOG_DIR];
for (var i=0; i < prerequisiteDirectories.length; i++ ){
	try {
		fs.statSync(nodeConstants.SERVER_DIR + '/' +  prerequisiteDirectories[i]);
	} catch (err) {
		try {
			fs.mkdirSync(nodeConstants.SERVER_DIR + '/' +  prerequisiteDirectories[i]);
		} catch (err2){ 
		}
	}
}

var logger = require('./lib/logger')('node');
var dbFunctions = require("./models/mongodb_functions");


//=======================================================================
// Initialize Express Server And Initialize Loggers
//=======================================================================

//configure morgan to add the user to the logged file info:
morgan.token('user',function getUser(req){
		if (req.user)
			return req.user[dbConstants.USERS.ID_FIELD];
		else
			return "";
	});
//=======================================================================
//Open write stream for log files
//=======================================================================
var comLog = fs.createWriteStream(nodeConstants.SERVER_DIR + "/" + nodeConstants.LOG_DIR + "/" + nodeConstants.COM_LOG_PATH);
var app = express();
app.use(morgan(':remote-addr - :user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"', {stream:comLog}));


//=======================================================================
// Serve Static Public Content (ie, dont need to be logged in to access)
//=======================================================================
app.use("/static", express.static(path.join(nodeConstants.SERVER_DIR + "/public")));

//=======================================================================
//If using https then add redirect callback for all incoming http calls.
//=======================================================================
if (opts.https){
	app.use(function (req, res, next) {
		if (req.secure) {
			// request was via https, so do no special handling
			next();
		} else {
			// request was via http, so redirect to https
			req.headers.host = req.headers.host.replace(/:.+/,"");
			var url = "https://" + req.headers.host + (opts.httpsPortNumber == 443 ? "":":" + opts.httpsPortNumber.toString()) + req.url;	
			res.redirect(url); //
		}
	});
}

//=======================================================================
// Add Parsers
//=======================================================================
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:false}));

//=======================================================================	
// Set up Passport to use Authentication
//=======================================================================
require('./controllers/passport-config')(passport,dbFunctions,opts);

//=======================================================================
// Initialize the session Session
//=======================================================================
//In the future use a redis session to configure the session information
app.use(session({secret:'webb_app_server',
	store: new mongoStore({
		url:'mongodb://' + dbConstants.DB.HOST + ':' + dbConstants.DB.PORT + '/sessionInfo'
	}),
	resave:false,
	secure:true,
	saveUninitialized:false
}));
logger.info('mongodb://' + dbConstants.DB.HOST + ':' + dbConstants.DB.PORT + '/sessionInfo');
//=======================================================================
// Initialize Passport and session
//=======================================================================
app.use(passport.initialize());
app.use(passport.session());
app.use(flash());

//=======================================================================
// Add routes and add the rendering engine
//=======================================================================
app.set('views',nodeConstants.SERVER_DIR + '/views');
app.engine('hbs',cons.handlebars);
app.set('view engine', 'hbs');
require('./controllers/routes')(app,passport,dbFunctions,opts,logger);

//=======================================================================
// Connect and Initialzie the storage Database
//=======================================================================
dbFunctions.connectAndInitializeDB()
.catch(function(err) {
	logger.error(err.toString());
	logger.error(err.stack);
	logger.error("Exiting due to connection error with DB server.");
	process.exit(1);
});

//=======================================================================
// Start Listening on the set port
//=======================================================================
if (opts.https){
	var privateKey = fs.readFileSync(opts.key);
	var certificate = fs.readFileSync(opts.crt);
	var credentials = {key:privateKey,cert:certificate};
	http.createServer(app).listen(opts.httpPortNumber);
	https.createServer(credentials,app).listen(opts.httpsPortNumber);
	logger.info("Server running on https port: " + opts.httpsPortNumber + " http port:" + opts.httpPortNumber);
} else {
	logger.info("Server runnong on http port: " + opts.httpPortNumber);
	app.listen(opts.httpPortNumber);
}
//=======================================================================
// Exit Event
//=======================================================================
/* Listen for SIGINT events. These can be generated by typing CTRL + C in the 
 * terminal. */ 
process.on("SIGINT", function(){
	logger.info("\nReceived interrupt signal. Closing connections to DB...");
	dbFunctions.closeConnection(function() {
		logger.info("Bye!");
		process.exit(0);
	});
});