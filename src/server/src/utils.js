var constants = require('../lib/conf/constants.json')
var dbFunctions = require(constants.nodeConstants.SERVER_DIR + "/models/mongodb_functions"),
	_ = require('underscore');
/* utility functions available for all routes
 * @author Patrick Magee */
module.exports = {
	isLoggedIn:function(req,res,next){
		if (req.isAuthenticated())
			return next();
		res.redirect('/login');
	},
	render:function(req,res,_o){
		var template;
		template = 'layout.hbs';
		if (!_o){
			_o = {};
		}
		if (!_o.scripts)
			_o.scripts = [];
		else if (Object.prototype.toString.call(_o.scripts) == '[object String]')
			_o.scripts = [_o.scripts];

		for (var i = 0; i < _o.scripts.length; i++){
			_o.scripts[i] = '/static/js/' + _o.scripts[i];
		}

		_o.title = 'PGX webapp';
		_o.cache = true;

		if (_o.type == "construction")
			_o.construction = true;
		else if (_o.type == 'notfound') {
			_o.notfound = true;
		}
		if (req.isAuthenticated()) {
			_o.authenticated = true;
			_o.user = req.user.username;
			// eventually add _o.admin_user this will toggle the admin configuration
			// once the configuration is toggled it will take the user to the admin
			// page.
			var options = {
				'admin-email':1,
				'_id':0
			};
			dbFunctions.getAdminEmail(constants.dbConstants.DB.ADMIN_COLLECTION,{},options).then(function(result){
				_o.admin = result === _o.user;
				res.render(template,_o);	
			});
			
		} else {
			res.render(template,_o);
		}
	},
	/* given the the ObjectString and a refObj attempt to creatae a new nested object.
	 * if this is successful, create the object and return the context that it amy be added in.
	 * If the del flag is added, then only the context has to be returned */
	createNestedObject : function(objString, refObj, doc, del){
		var split = objString.split('.');
		var cont = true;
		var newDoc = {};
		var point = newDoc;
		var depthString = [];
		var isNew = false;
		var action;
		var origRefObj = refObj;
		for (var i = 0; i < split.length; i++ ){
			if (refObj.hasOwnProperty(split[i]) && cont){
				refObj = refObj[split[i]];
				depthString.push(split[i]);
			} else {
				cont = false;
				point[split[i]] = {};
				point = point[split[i]];
			}
		}
		if (refObj.hasOwnProperty('secondary')){
			point.secondary = refObj.secondary;
		}

		if (!del) {
			point.rec = doc.rec;
			point.risk = doc.risk;
			point.pubmed = doc.pubmed;
			var headKey = Object.keys(newDoc);
			if (headKey.length == 1){
				depthString.push(headKey[0]);
				newDoc = newDoc[headKey[0]];
				isNew = true;
			}
			return {cont:newDoc,depth:depthString.join('.'),isNew:isNew,action:action};
		} else {
			var o = this.editEndNode(origRefObj,depthString.join('.'))
			this.removeEmpty(o);
			return o;
		}
		
	},

	/* Recursively edit a node, setting the final node at the end of string to empty */
	editEndNode : function(refObj,string){
		if (string === ''){
			if (refObj.hasOwnProperty('secondary')){
				var secondary =  refObj.secondary
				refObj = {};
				refObj.secondary = secondary;
				return refObj;
			} else {
				return {};
			}
		} else {
			string = string.split('.');
			var first = string[0];
			string.shift();	
			refObj[first] = this.editEndNode(refObj[first],string.join('.'))
			return refObj;
		}
	},

	/* recursively remove all empty objects from the parent object */
	removeEmpty : function(object) {
		var _this = this;
	    if (!_.isObject(object)) {
	        return;
	    }
	    _.keys(object).forEach(function(key) {
	        var localObj = object[key];
	        
	        if (_.isObject(localObj)) {
	            
	            if (_.isEmpty(localObj)) {
	                
	                delete object[key];
	                return;
	            }
	 
	            // Is object, recursive call
	            _this.removeEmpty(localObj);
	                           
	            if (_.isEmpty(localObj)) {
	 
	                delete object[key];
	                return;
	            }
	        }
	    })
	},
	/* Sort two lists based on the first list, return an object containinf the first
	 * and the seocnd sorted lists */
	sortWithIndeces:function(toSort, toSort2) {
	  var output = [];
	  for (var i = 0; i < toSort.length; i++) {
	    toSort[i] = [toSort[i], i];
	  }
	  toSort.sort(function(left, right) {
	    return left[0] < right[0] ? -1 : 1;
	  });
	  var sortIndices = [];
	  for (var j = 0; j < toSort.length; j++) {
	    sortIndices.push(toSort[j][1]);
	    toSort[j] = toSort[j][0];
	  }	  
	  for (var i = 0; i < toSort.length; i++ ){
	  	output[i] = toSort2[sortIndices[i]];
	  }


	  return {first:toSort,second:output};
	}
};