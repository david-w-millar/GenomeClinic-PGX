var Promise = require("bluebird");
var dbConstants = require("../lib/conf/constants.json").dbConstants;
var nodeConstants = require('../lib/conf/constants.json').nodeConstants;
var utils = require("../lib/utils");
//var dbConstants = require("../conf/constants.json").dbConstants;
//var nodeConstants = require('../conf/constants.json').nodeConstants;
var MissingParameterError = require('../lib/errors/MissingParameterError');
var InvalidParameterError = require('../lib/errors/InvalidParameterError');


var ASCENDING_INDEX = 1;
var DESCENDING_INDEX = -1;
var MISSING = -1;
var INCLUDE = 1;
var EXCLUDE = 0;

module.exports = function(dbOperation){
	//=======================================================================================
	//Patient Functions
	//=======================================================================================

	/* Create a patient with the input patient ID.
	 * Returns a promise which resolves to the new patient collection ID. */
	utils.checkAndExtend(dbOperation,"addPatient", function(options, user) {
		var _this = this;
		var args = arguments;
		var currentPatientCollectionID;

		var promise= new Promise(function(resolve, reject) {
			if (!options)
				reject(new MissingParameterError("Options parameter is required"));
			if (!utils.isString(options) && !utils.isObject(options))
				reject(new InvalidParameterError("Options must either be a string or an object"));
			/* Get most recent patient collection ID integer from the admin table
			 * and increment it. */
			_this.findOne(dbConstants.DB.ADMIN_COLLECTION, {}, user)	
				.then(function(doc) {
					currentPatientCollectionID= doc[dbConstants.PATIENTS.CURRENT_INDEX_FIELD];
					// Add new patient
					if (typeof options === 'object'){
						currentDocument = options;
					} else { 
						currentDocument= {};
						currentDocument[dbConstants.PATIENTS.ID_FIELD] = options;
					}						
					currentDocument[dbConstants.PATIENTS.COLLECTION_ID]= "p" + currentPatientCollectionID;
					return _this.insert(dbConstants.PATIENTS.COLLECTION, currentDocument,user);
				}).then(function(result) {
					// Increment patient collection ID only after insert is done
					currentDocument= {};
					currentDocument[dbConstants.PATIENTS.CURRENT_INDEX_FIELD]= 1;  // increment by 1
					return _this.update(dbConstants.DB.ADMIN_COLLECTION, {}, {$inc: currentDocument},undefined,user);
				}).then(function(result) {
					resolve({newCollection:"p" + currentPatientCollectionID, document:currentDocument});
				}).catch(function(err) {
					_this.logger("error",err,{action:'addPatient',target:dbConstants.PATIENTS.COLLECTION,arguments:args});
					reject(err);
				});
		});
		return promise;
	});

	/* remove patient from the patient collection. Takes two arguments, the first is the
	 * patient name, and the second is the suer adding the patient. */
	utils.checkAndExtend(dbOperation, "removePatient", function(patient,user){
		var query = {};
		var _this = this;
		var failure;
		var promise = Promise.resolve().then(function(){
			if (!patient)
				throw new MissingParameterError("missing required parameter");
			if (!utils.isString(patient))
				throw new InvalidParameterError("Patient name must be a string");

			query[dbConstants.PATIENTS.ID_FIELD] = patient;
			return _this.findOne(dbConstants.PATIENTS.COLLECTION,query,user).then(function(result){
				failure = result;
				return _this.dropCollection(result[dbConstants.PATIENTS.COLLECTION_ID],user);
			}).catch(function(err){
			}).then(function(){
				return _this.removeDocument(dbConstants.PATIENTS.COLLECTION,query,user);
			}).then(function(){
				failure[dbConstants.FAILURE.ANNO_COMPLETE] = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
				failure[dbConstants.FAILURE.FAIL_FIELD] = true;
				return _this.insert(dbConstants.FAILURE.COLLECTION,failure);
			}).catch(function(err){
					_this.logger('error',err,{user:user,action:'removePatient'});
			});
		});
		return promise;
	});

	/* Find all the patients in the 'patients' collection.
	 * Returns a promise that returns an array of elements corresponding to All
	 * the patient_id's
	 * *** RELIES ON PROJECT OPERATIONS ****
	 */
	utils.checkAndExtend(dbOperation, "findAllPatientIds", function(username){
		var collectionName = dbConstants.PATIENTS.COLLECTION;
		var options = {'_id':0};
		var _this = this;
		options[dbConstants.PATIENTS.ID_FIELD]=INCLUDE;	
		return _this.findProjects(undefined,username).then(function(result){
			var tags = result.map(function(item){
				return item[dbConstants.PROJECTS.ID_FIELD];
			});
			var tagQuery = {};
			tagQuery[dbConstants.PROJECTS.ARRAY_FIELD] = {$in:tags};
			var query = {$or:[tagQuery]};
			var q ={};
			q[dbConstants.DB.OWNER_ID] = username;
			query.$or.push(q);
			return _this.find(collectionName, query, {}, options, username);
		});
	});


	/* find all the patients in the patient collection and return an array
	 * corresponding to the entire document of each patient.
	 * If readyOnly == true, return only fully uploaded patients.
	 * To get output sorted by date and time(newest patient records first), do:
	 * options == {sort: {"date": -1, "time": -1}} */

	utils.checkAndExtend(dbOperation, "findAllPatientsInProject", function(project,options,user){
		var _this = this;
	
		var promise = Promise.resolve().then(function(){
			var field = {'_id':0};
			var query = {};

			if (!project)
				throw new MissingParameterError("Project name required");
			if (!utils.isString(project))
				throw new InvalidParameterError("project name must be a valid string");
			query[dbConstants.PROJECTS.ARRAY_FIELD] = project;
			return _this.find(dbConstants.PATIENTS.COLLECTION,query,field,options,user);
		});
		return promise;
	});


	/* Given a specific project, return all available patients for a user that are
	 * not listed in that project. this is used for adding patients to an existing 
	 * project */
	utils.checkAndExtend(dbOperation, "findAllPatientsNinProject", function(project,username,options){
		var _this = this;
		//find all the availble projects for this person
		var promise = Promise.resolve().then(function(){
			if (!project)
				throw new MissingParameterError("Project name required");
			if (!utils.isString(project))
				throw new InvalidParameterError("project name must be a valid string");

			return _this.findProjects(undefined,username).then(function(result){
				return result.filter(function(item){
					if (item[dbConstants.PROJECTS.ID_FIELD] != project)
						return item[dbConstants.PROJECTS.ID_FIELD];
				});
			}).then(function(result){
				var query = {},tagQuery={},ownerQuery={},queryList=[];
				ownerQuery[dbConstants.DB.OWNER_ID] = username;
				queryList.push(ownerQuery);
				if (result.length > 0){
					tagQuery[dbConstants.PROJECTS.ARRAY_FIELD] = {$in:result};
					queryList.push(tagQuery);
					queryList.$or = queryList;
				} else {
					query = ownerQuery;
				}
				query[dbConstants.PATIENTS.READY_FOR_USE] = true;
				return _this.find(dbConstants.PATIENTS.COLLECTION,query,null,options,username);
			}).then(function(result){
				return result.filter(function(patient){
					if (!patient[dbConstants.PROJECTS.ARRAY_FIELD])
						return patient;
					if (patient[dbConstants.PROJECTS.ARRAY_FIELD].indexOf(project)==-1)
						return patient;
				});
			});
		});
		return promise;
	});

	/* Find all of the patients for a praticular user. this will find either ALLL
	 * patients in the the entire database regardless of their status or it will find
	 * only those that are ready for analysis depending on if readyOnly is true or not.
	 * If readyonly is False or undefiend, this function will look for all non-ready,ready,
	 * And failed vcf files. It will then return a concatenated list of all of them
	 */
	utils.checkAndExtend(dbOperation, "findAllPatients", function(username,readyOnly,options){
		var _this = this;
		var promise = Promise.resolve().then(function(){
			if (!username)
				throw new MissingParameterError("username required");
			if (!utils.isString(username))
				throw new InvalidParameterError("username name must be a valid string");
			if (readyOnly && !utils.isBool(readyOnly))
				throw new InvalidParameterError("readyonly must be a boolean value");
			if (options && !utils.isObject(options))
				throw new InvalidParameterError("Options must be an object");
			return _this.findProjects(undefined,username)
			.then(function(result){
				return result.map(function(item){
					return item[dbConstants.PROJECTS.ID_FIELD];
				});
			}).then(function(result){
				var query = {},tagQuery={},ownwerQuery={},queryList=[];
				ownwerQuery[dbConstants.DB.OWNER_ID] = username;
				queryList.push(ownwerQuery);
				if (result.length > 0){
					tagQuery[dbConstants.PROJECTS.ARRAY_FIELD] = {$in:result};
					queryList.push(tagQuery);
				}
				query.$or = queryList;
				if (readyOnly){
					query[dbConstants.PATIENTS.READY_FOR_USE] = true;
					return _this.find(dbConstants.PATIENTS.COLLECTION,query,null,options,username);
				} else {
					var goodResults;
					return _this.find(dbConstants.PATIENTS.COLLECTION,query,null,options,username)
					.then(function(result){
						goodResults = result;
						return _this.find(dbConstants.FAILURE.COLLECTION,query,null,options,username);
					}).then(function(failures){
						return goodResults.concat(failures);
					}).then(function(result){
						result = result.sort(function(a,b){
							a = a.added.split(/\s/);
							b = b.added.split(/\s/);
							if (a[0] < b[0]){
								return 1;
							} else if (a[0] > b[0]) {
								return -1;
							} else {
								if (a[1] < b[1])
									return 1;
								else if (a[1] > b[1])
									return -1;
								return 0;
							}
						});
						return result;
					});
				}
			});
		});
		return promise;
	});
};
