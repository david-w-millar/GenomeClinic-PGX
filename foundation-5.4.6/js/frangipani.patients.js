/*
 * Frangipani pharmacogenomics app JavaScript.
 * @author Ron Ammar
 */

/* Wrap all code in an immediately-invoked function expressions to avoid 
 * global variables. */
(function() {

var appMain= $("#frangipani-patients-main");

/* 
 * Auxiliary helper functions and constants.
 */
var aux= {

	/* Cache of handlebars templates. */
	template_cache: undefined,

	/* Function to retrieve and render a handlebars template. This function is
	 * an async version of that provided by user koorchik on StackOverFlow:
	 * http://stackoverflow.com/questions/8366733/external-template-in-underscore
	 * as explained on the following blog entry:
	 * http://javascriptissexy.com/handlebars-js-tutorial-learn-everything-about-handlebars-js-javascript-templating/
	 *
	 * NOTE: In the future, I would compile all my templates into a single
	 * templates.js file and load that in the beginning rather than have many
	 * small asynchronous AJAX calls to get templates when the webpage loads.
	 *
	 * Returns a promise. */
	asyncRenderHbs: function(template_name, template_data) {
		if (!aux.template_cache) { 
		    aux.template_cache= {};
		}

		var promise= undefined;

		if (!aux.template_cache[template_name]) {
			promise= new Promise(function(resolve, reject) {
				var template_url= '/templates/' + template_name;
				$.ajax({
					url: template_url,
					method: 'GET',
					success: function(data) {
						aux.template_cache[template_name]= Handlebars.compile(data);
						resolve(aux.template_cache[template_name](template_data));
					},
					error: function(err, message) {
						reject(err);
					}			
				});
			});
		} else {
			promise= Promise.resolve(aux.template_cache[template_name](template_data));
		}
		
		return promise;
	},


	/* Convert form into JSON.
	 * Function adapted from http://stackoverflow.com/questions/1184624/convert-form-data-to-js-object-with-jquery */
	serializeObject: function(form) {
	    var o = {};
	    var a = form.serializeArray();
	    $.each(a, function() {
	        if (o[this.name] !== undefined) {
	            if (!o[this.name].push) {
	                o[this.name] = [o[this.name]];
	            }
	            o[this.name].push(this.value || '');
	        } else {
	            o[this.name] = this.value || '';
	        }
	    });
	    return o;
	},


	/* Assert function, because it's not built into browser.
	 * Code from: http://stackoverflow.com/questions/15313418/javascript-assert */
	assert: function(condition, message) {
	    if (!condition) {
	        message = message || "Assertion failed";
	        if (typeof Error !== "undefined") {
	            throw new Error(message);
	        }
	        throw message; // Fallback
	    }
	},

	/*
	 * Compute the Levenshtein distance (edit distance) between the two given strings.
	 * Sources:
	 * http://en.wikibooks.org/wiki/Algorithm_Implementation/Strings/Levenshtein_distance#JavaScript
	 * or
	 * http://gist.github.com/andrei-m/982927
	 * Copyright (c) 2011 Andrei Mackenzie
	 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
	 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
	 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
	 */
	getEditDistance: function(a, b){
	  if(a.length == 0) return b.length; 
	  if(b.length == 0) return a.length; 
	 
	  var matrix = [];
	 
	  // increment along the first column of each row
	  var i;
	  for(i = 0; i <= b.length; i++){
	    matrix[i] = [i];
	  }
	 
	  // increment each column in the first row
	  var j;
	  for(j = 0; j <= a.length; j++){
	    matrix[0][j] = j;
	  }
	 
	  // Fill in the rest of the matrix
	  for(i = 1; i <= b.length; i++){
	    for(j = 1; j <= a.length; j++){
	      if(b.charAt(i-1) == a.charAt(j-1)){
	        matrix[i][j] = matrix[i-1][j-1];
	      } else {
	        matrix[i][j] = Math.min(matrix[i-1][j-1] + 1, // substitution
	                                Math.min(matrix[i][j-1] + 1, // insertion
	                                         matrix[i-1][j] + 1)); // deletion
	      }
	    }
	  }
	 
	  return matrix[b.length][a.length];
	}


};  // End of aux methods


/* AJAX call to application server to retrieve patients.
 * This is based on the local MongoDB collections, not GA4GH. */
var getPatients= function() {
	//Promise Function
	var promise= Promise.resolve($.ajax({
		url: "/patients",
		type: "GET",
		contentType: "application/json",
	}))
	.then(function(result) {
		var context= {
			"patients": result
		};
		return context;
	});

	return promise;
};


/* Create a promise function to wrap our browse button tasks. */
var loadPatients= function() {
	getPatients()
	.then(function(result) {
		appMain.children().remove();  // clear the current page
		var context= result;
		return aux.asyncRenderHbs('frangipani-patients.hbs', context);
	})
	.then(function(html) {
		appMain.append(html);
		addEventListeners();
	});
};


/* Create globally-scoped PGx data. */
var globalPGXData= {};


/* Process the PGx data received from the server for this specific patient. */
var processPGXResponse= function(selectedPatientAlias, selectedPatientID, serverResponse) {
	// Ensure the ID we sent and the ID we received from the server match
	aux.assert(selectedPatientID === serverResponse.patientID, 
		"ERROR: Browser patient ID and server patient ID do not match.");

	var pgxData= serverResponse;
	pgxData["patientAlias"]= selectedPatientAlias;  // add the patient alias

	// Create list of all marker IDs for each gene by iterating through all 
	// haplotypes and store a unique list of markers
	var genes= Object.keys(pgxData["pgxGenes"]);
	for (var i= 0; i < genes.length; ++i) {
		var geneMarkers= [];
		var geneName= genes[i];

		var haplotypes= Object.keys(pgxData["pgxGenes"][geneName]);
		for (var j= 0; j < haplotypes.length; ++j) {
			var haplotypeName= haplotypes[j];

			var haplotypeMarkers= pgxData["pgxGenes"][geneName][haplotypeName];
			for (var k= 0; k < haplotypeMarkers.length; ++k) {
				// Make sure marker is not already in list (unique list)
				if (geneMarkers.indexOf(haplotypeMarkers[k]) === -1) {
					geneMarkers.push(haplotypeMarkers[k]);
				}
			}
		}

		// Store the list of unique markers in this object
		pgxData["pgxGenes"][geneName]["geneMarkers"]= geneMarkers;
	}
	return Promise.resolve(pgxData);
};


/* Use the GT field to determine if a variant is heterozygous or homozygous.
 * Returns a bool. */
var isHom= function(variant) {
	var homozygous= true;

	// check that all/both genotype indices are identical
	var firstIndex= variant["gt"][0];
	for (var i= 1; i < variant["gt"].length; ++i) {
		if (variant["gt"][i] !== firstIndex) {
			homozygous= false;
		}
	}

	return homozygous;
};


/* Add variants to the known diplotype. These include already phased or 
 * homozygous unphased genotypes. The function modifies the defined diplotype
 * passed to it. A diplotype contains exactly 2 haplotypes, and they can be
 * equivalent.
 * Precondition: variants passed to this function are already known to be
 * phased or homozygous (and unphased). */
var addToDefinedDiplotype= function(marker, variant, diplotype) {
	var definedDiplotype= diplotype;

 	// if empty, initialize defined diplotypes to exactly 2 haplotypes
 	if (definedDiplotype === null) {
 		definedDiplotype= [[], []];
 	}

 	// not using alleles directly, but this may come in handy later.
 	//var alleles= [variant["ref"]].concat(variant["alt"]);

 	for (var i= 0; i < variant["gt"].length; ++i) {
 		if (variant["gt"][i] > 0) {
 			definedDiplotype[i].push(marker);
 		}
 	}

 	return definedDiplotype;
 };


/* Return all possible haplotypes by combining already defined haplotypes
 * (based on phased genotypes and unphased homozygous calls) with unphased
 * heterozygous calls. */
var getPossibleHaplotypes= function(definedDiplotype, unphasedHets) {
	var possibleHaplotypes= [];
	if (definedDiplotype !== null) {
		possibleHaplotypes= definedDiplotype.slice();  // copy the array
	}

	var unphasedHetKeys= Object.keys(unphasedHets);
	for (var i= 0; i < unphasedHetKeys.length; ++i) {

		// For each defined haplotype, create a version with the het ref call
		// and a version with the het alt call. 
		// NOTE: potential source of inefficiency here - duplicate haplotypes
		// can occur. By removing these, we shorten our computation. Not urgent.
		var newPossibleHaplotypes= [];
		for (var j= 0; j < possibleHaplotypes.length; ++j) {
			newPossibleHaplotypes.push(possibleHaplotypes[j]);  // het REF call
			newPossibleHaplotypes.push(
				possibleHaplotypes[j].concat(unphasedHetKeys[i]));  // het ALT call
		}

		possibleHaplotypes= newPossibleHaplotypes;
	}

	return possibleHaplotypes;
};


/* Generate all possible haplotypes from the genotype data.
 * This takes into account 
 * Returns a promise. */
var generateAllHaplotypes= function(pgxData) {
	var pgxData= pgxData;
	pgxData["possibleHaplotypes"]= {};

	// Iterate through all genes
	//var geneNames= Object.keys(pgxData["pgxGenes"]);  ///// UNBLOCK AFTER MERGED WITH NEW ANNOTATOR
	////////////////////TESTING
	var geneNames= ["cyp2d6", "tpmt"];  ///// TESTING- ONLY with genes that dont have multiple alts
	
	for (var i= 0; i < geneNames.length; ++i) {
		// see lab notebook for ideas here: - lists of hashes
		var definedDiplotype= null;
		var unphasedHets= {};
		var possibleHaplotypes= [];

		// Iterate through the markers for this gene, and match variants by
		// coordinates not gene name (which is annotated by annovar)
		var currentGeneMarkers= pgxData["pgxGenes"][geneNames[i]]["geneMarkers"];
		var allVariants= pgxData["variants"];
		for (var j= 0; j < currentGeneMarkers.length; ++j) {
			var m= currentGeneMarkers[j];
			var chrom= pgxData["pgxCoordinates"][m]["chr"];
			var pos= pgxData["pgxCoordinates"][m]["pos"];

			// Match with this patient's variants. Simplest to iterate through
			// all patient variants and match coordinates for current marker
			for (var k= 0; k < allVariants.length; ++k) {
				var currentVariant= allVariants[k];
				if (chrom === currentVariant["chr"] && pos === currentVariant["start"]) {  ///////////// START may turn into POS later - POTENTIAL BUG!
					if (currentVariant["phased_status"] || isHom(currentVariant)) {
						definedDiplotype= addToDefinedDiplotype(m, currentVariant, definedDiplotype);
					} else {
						unphasedHets[m]= currentVariant;
					}
				}
			}
		}

		possibleHaplotypes= getPossibleHaplotypes(definedDiplotype, unphasedHets);

		console.log(geneNames[i], definedDiplotype, unphasedHets); ///////////////////
		console.log(possibleHaplotypes); ///////////////

		// add the possible haplotypes to the main pgx
		pgxData["possibleHaplotypes"][geneNames[i]]= possibleHaplotypes;
	}

	console.log(pgxData); ///////////////// TESTING

	return Promise.resolve(pgxData);
};


/* Displays the processed PGx data for this specific patient. */
var loadPGx= function(pgxData) {
	appMain.children().remove();  // clear the current page
	aux.asyncRenderHbs('frangipani-pgx.hbs', pgxData)
	.then(function(html) {
		appMain.append(html);
		addEventListeners();
	});
};


/* Handlebars block helper to avoid outputting "geneMarkers" list as a
 * haplotype when rendering the table.
 * Only problem with this approach is if a haplotype with the key 
 * "geneMarkers" is ever created (case-sensitive). Based on current CPIC
 * guidelines, this is extremely unlikely, so should be safe. */
Handlebars.registerHelper("isHaplotype", function(conditional, options) {
	if (conditional != "geneMarkers") {
		return options.fn(this);
	}
});


/* Handlebars block helper to output PGx variant details.
 * This helper is going to be a little messy, but this particular task is a bit
 * complicated and I don't think can be acheived within the template itself. */
Handlebars.registerHelper('haplotypeMarkers', function(context, options) {
	var renderedHtml= "";
	var currentGene= options.data._parent.key;
	var currentHaplotype= context;

	var currentGeneMarkers= globalPGXData["pgxGenes"][currentGene]["geneMarkers"];
	for (var i= 0; i < currentGeneMarkers.length; ++i) {
		var m= currentGeneMarkers[i];

		var haplotypeMarkers= globalPGXData["pgxGenes"][currentGene][currentHaplotype];
		if (haplotypeMarkers.indexOf(m) !== -1) {  // haplotype is defined by this marker
			renderedHtml += "<td class='variant-alt'>" + 
				globalPGXData["pgxCoordinates"][m]["alt"].toString() + "</td>"; // alt is an array
		} else {
			renderedHtml += "<td>" + globalPGXData["pgxCoordinates"][m]["ref"] + "</td>";
		}
	}

	return renderedHtml;
});


/* Add the event listeners */
var addEventListeners= function() {
	// Listen for row clicks and then select the patient ID child.
	$("tr.patient-row").on("click", function() {
		var selectedPatientID= $(this).children("[class~='frangipani-patient-id']").text();
		var selectedPatientAlias= $(this).children("[class~='frangipani-patient-alias']").text();
		Promise.resolve($.ajax({
				url: "/pgx",
				type: "POST",
				contentType: "application/json",
				dataType: "json",
				data: JSON.stringify({
					"patient_id": selectedPatientID
				})
		}))
		.then(function(result) {
			return processPGXResponse(selectedPatientAlias, selectedPatientID, result);
		})
		.then(function(result) {
			return generateAllHaplotypes(result);
		})
		.then(function(result) {
			globalPGXData= result;  // set the globally-scope PGX Data
			loadPGx(result);
		});
	});
};


/* 
 * Set up a ready handler, a function to run when the DOM is ready
 */
var handler= function() {
	loadPatients();
};


/* 
 * Wait for the DOM to load before any processing.
 */
$(document).ready(handler);

})();




