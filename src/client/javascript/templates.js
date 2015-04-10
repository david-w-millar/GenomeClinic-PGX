/* Templates to be rendered and precompiled prior to be sent to webpage
 * @author Patrick Magee
 */
var $ = require('jquery');
var index = require('../templates/index.hbs'),
	navbar = require('../templates/navbar.hbs'),
	login = require('../templates/login.hbs'),
	signup = require('../templates/signup.hbs'),
	recover = require('../templates/recover.hbs'),
	setpassword = require('../templates/set-password.hbs'),
	statuspageIndex = require('../templates/status-page.hbs'),
	statuspageRow = require('../templates/status-page-add-status-row.hbs'),
	uploadpageIndex = require('../templates/upload.hbs'),
	uploadpageVcf = require('../templates/upload-add-vcf.hbs'),
	uploadpageProgress = require('../templates/upload-add-progress-bar.hbs'),
	projectIndex = require('../templates/project.hbs'),
	projectNew = require('../templates/project-add-project.hbs'),
	projectInfo = require('../templates/project-info-page.hbs'),
	projectUser = require('../templates/project-auth-user.hbs'),
	patient = require('../templates/patients-table.hbs'),
	pgx = require('../templates/pgx-page.hbs'),
	config = require('../templates/server-config.hbs'),
	phase_page = require('../templates/phase-page.hbs'),
	phase_current = require('../templates/phase-current.hbs'),
	phase_new = require('../templates/phase-add-gene.hbs'),
	phase_add_row = require('../templates/phase-add-marker-row.hbs'),
	phase_add_haplotype = require('../templates/phase-add-haplotype.hbs'),
	marker_page = require('../templates/marker-page.hbs'),
	marker_add_row = require('../templates/marker-add-marker.hbs');

/* return a promisfied version of the template that accepts a single parameter
 * o to render the template */
var _t = function(t){
	return function p (o){
		return Promise.resolve().then(function(){
			return t(o);
		});
	};
};


//Return object with All the templates
module.exports = {
	index:_t(index),
	navbar:_t(navbar),
	login:_t(login),
	signup:_t(signup),
	recover:_t(recover),
	setpassword:_t(setpassword),
	statuspage:{
		index:_t(statuspageIndex),
		row:_t(statuspageRow)
	},
	uploadpage:{
		index:_t(uploadpageIndex),
		vcf:_t(uploadpageVcf),
		progress:_t(uploadpageProgress)
	},
	project:{
		index:_t(projectIndex),
		new:_t(projectNew),
		info:_t(projectInfo),
		user:_t(projectUser)
	},
	patient:_t(patient),
	pgx:_t(pgx),
	config:_t(config),
	haplotypes:{
		index:_t(phase_page),
		current:_t(phase_current),
		row:_t(phase_add_row),
		haplotype:_t(phase_add_haplotype),
		new:_t(phase_new)
	},
	markers:{
		index:_t(marker_page),
		row:_t(marker_add_row)
	}
};