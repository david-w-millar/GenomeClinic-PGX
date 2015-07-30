/* General desintation routes. This is called last when 
 * adding route information. these reoutes essentially
 * are what is handling serving page content to the browser.
 * @author Ron Ammar
 * @author Patrick Magee
 */
var Promise = require('bluebird');
var constants = require('../lib/conf/constants.json');
var utils = require('../lib/utils');
var dbFunctions = require("../models/mongodb_functions");

var dbConstants = constants.dbConstants,
	nodeConstants = constants.nodeConstants;

module.exports = function(app,logger,opts){
	var configured;
	//==================================================================
	//Route to the home page, or the config page if it is not set
	//==================================================================
	app.get("/", utils.isLoggedIn, function(req, res) {
		/* Check if the server has already been configured. 
		 * Using a bit of promise voodoo to ensure we check the DB first, but only
		* when configured !== true, so as to reduce DB interactions. */	
		var promise= new Promise.resolve(configured);
		if (!configured) {
			promise= dbFunctions.isConfigured();
		}

		/* If server is not configured redirect to the config page. Use a boolean
		 * instead of checking the DB with each request. */
		promise.then(function(resolved_config) {
			if (resolved_config) {
				if (!configured) {
					configured= resolved_config;
				}
				var options = {
					code:{
						code: "$(document).ready(function(){templates.index({title:'PGX Webapp'}).then(function(renderedHtml){$('#main').html(renderedHtml);});});",
						type:"text/javascript"
					}
				}
				utils.render(req,res,options);
			} else {
				res.redirect('/config');
			}
		});
	});


	//==================================================================
	//config form
	//==================================================================
	app.get("/config", utils.isLoggedIn, function(req,res){
		dbFunctions.getAdminEmail()
		.then(function(result){
			if (result === req.user.username)
				utils.render(req,res,{scripts:'config.js'});	
			else {
				if (configured === undefined){
					dbFunctions.isConfigured()
					.then(function(result){
						if ( result )
							utils.render(req,res,'notfound');
						else
							utils.render(req,res,{scripts:'config.js'});
					});
				} else {
					utils.render(req,res,'notfound');
				} 
			}
		});
	});

	app.post("/config", utils.isLoggedIn, function(req,res){
		var configSettings= req.body;
		dbFunctions.update(dbConstants.DB.ADMIN_COLLECTION, {}, {$set: configSettings},undefined,req.user.username)
		.then(function(result){
			dbFunctions.isConfigured(true);
		}).then(function(result){
			res.send(JSON.stringify(true));
		});
	});

	app.get('/config/current', utils.isLoggedIn, function(req,res){
		dbFunctions.findOne(dbConstants.DB.ADMIN_COLLECTION,{},req.user.username).then(function(result){
			res.send(result);
		})
	})

	//==================================================================
	//Generic page routers
	//==================================================================

	app.get(['/statuspage'], utils.isLoggedIn, function(req,res){
		utils.render(req,res,{scripts:'status-page.js'});
	});


	//==================================================================
	//Generic DB  / utility routes
	//==================================================================
	app.get("/database/patients/completed", utils.isLoggedIn, function(req,res){
		var username = req.user[dbConstants.USERS.ID_FIELD];
		dbFunctions.findAllPatients(username,true,{sort: {"completed": -1}})
		.then(function(result){
			res.send(result);
		});

	});

	/* Find ALL patients including those in the queue and failure db */
	app.use('/database/patients/all',utils.isLoggedIn, function(req,res){
		var username = req.user[dbConstants.USERS.ID_FIELD];
		dbFunctions.findAllPatients(username, false, {sort:{'added':-1}})
		.then(function(result){
			res.send(result);
		});
	});

	app.post('/database/owner',utils.isLoggedIn,function(req,res){
		var user = req.user[dbConstants.USERS.ID_FIELD];
		var collection = req.body.collection;
		var query = req.body.query;
		dbFunctions.getOwner(collection,query)
		.then(function(result){
			if (result);
				var _o = {
					owner:result,
					isOwner:(user==result),
					user:user
				};
				res.send(_o);
		}).catch(function(err){
			console.log(err);
		});
	});

	/* checkt to see whether the content within the body is within the database
	 *  returns true/false */
	app.post('/database/checkInDatabase',utils.isLoggedIn,function(req,res){
		var options = req.body;
		dbFunctions.checkInDatabase(options.collection,options.field,options.value)
		.then(function(result){
			res.send(result);
		});
	});

	app.get('/database/suggestions',utils.isLoggedIn,function(req,res){
		var mapper = {
			marker : {
				col:dbConstants.PGX.COORDS.COLLECTION,
				field:dbConstants.PGX.COORDS.ID_FIELD
			},
			drugs : {
				col :dbConstants.DRUGS.DRUGS.COLLECTION,
				field:dbConstants.DRUGS.DRUGS.ID_FIELD
			},
			genes : {
				col : dbConstants.DRUGS.ALL.COLLECTION,
				field : dbConstants.DRUGS.ALL.ID_FIELD
			},
			haplotype : {
				col : dbConstants.PGX.GENES.COLLECTION,
				field : dbConstants.PGX.GENES.ID_FIELD,
				gene : dbConstants.PGX.GENES.GENE
			}
		}

		var term = req.query.term;
		var collection = req.query.col;
		var num = parseInt(req.query.num) || 20;
		var strict = req.query.strict !== 'true' ? 'i' : '';
		var multiple = req.query.multiple == 'true' ? 'g' : '';
		var gene = req.query.gene || "";

		if (mapper[collection] == num ){
			req.flash('message','Invalid collection');
			res.redirect('/failure');
			return;
		}


		var agg = [];
		var query = {};
		term = term.replace(/\*/g,'\\*').replace(/\+/g,'\\+')
		query[mapper[collection].field] = {$regex:term}
		if (strict !== '') query[mapper[collection].field].$options = strict;
		if (multiple !== '') query[mapper[collection].field].$options = multiple;
		if (mapper[collection].gene) query[mapper[collection].gene] = gene;
		agg.push({$match:query})
		agg.push({$limit:num});
		agg.push({$group:{_id:null,matches:{$addToSet:'$' + mapper[collection].field}}});
		return dbFunctions.aggregate(mapper[collection].col,agg).then(function(result){
			if (result.length > 0) res.send(result[0].matches);
			else res.send([]);
		});

		

	})



	//==================================================================
	//Handle 404 routes
	//==================================================================
	/* NOTE: This must always be the ABSOLUTE last route added,
	 * Otherwise It will redirect a legitimate route to the 404 page.
	 * Essentially its sayin, anything coming in will be sent to 404notfound
	 */
	app.get(/^\/(.+)/, function(req,res){
		utils.render(req,res,{type:'notfound'});
	});
};





