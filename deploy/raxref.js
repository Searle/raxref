
// Raxref.js - The JavaScript Runtime library of Raxref

// Author: Dietrich Raisin, info1@raisin.de
// License: see LICENSE file

// Fall back if Firebug is not present
if (typeof console == 'undefined') {
    var console= { log: function() {} };
}

jQuery(function($) {

    var Slot= function(type) {
        this.id= Slot.nextId++;
        var newDiv= $("<div id='slot" + this.id + "' class='slot " + type + "'><div class='slot-i'>"
                        + "<div class='head-c'><div class='head'></div></div>"
                        + "<div class='body-c col2border'><div class='body col2border'></div></div>"
                    + "</div></div>");
                    
        $("#slots").prepend(newDiv);
    };

    Slot.nextId= 0;

    var slotX= new Slot('xref');
    var slotF= new Slot('file');
    var slotS= new Slot('section');
    var slotP= new Slot('project');

    function showText(slot, titleHtml, bodyHtml, omitScrollToTop) {
        $('#slot' + slot.id + ' .head').html(titleHtml);
        var $body= $('#slot' + slot.id + ' .body').html(bodyHtml);
        if (!omitScrollToTop) $body.scrollTo(0);
        return $body;
    }

    var getXrefList= function(token) {
        var rawXref= tokens[token];
        if (!rawXref) return null;

        var rawXrefs= rawXref.split(',');
        var xrefList= [];
        var xref= { file_no: 0, line_nos: [] };
        var last_file_no= 0;
        var last_line_no= 0;
        for (var rawXrefs_i in rawXrefs) {
            var item= rawXrefs[rawXrefs_i];
            if (item.substr(0, 1) == 'f') {
                last_file_no += parseInt(item.substr(1), 10);
                if (xref.line_nos.length) xrefList.push(xref);
                xref= { file_no: last_file_no, line_nos: [] };
                last_line_no= 0;
                continue;
            }
            last_line_no += parseInt(item, 10);
            xref.line_nos.push(last_line_no);
        }
        if (xref.line_nos.length) xrefList.push(xref);
        return xrefList;
    };

    // Das mit abort scheint nicht gut zu klappen. anderer weg:
    // fetchresult hat nen counter. wenn funct _next den falschen
    // counter findet, stoppt sie.

    // FIXME: Becomes a Slot property
    var hFetchResultAjax= [];

    // FIXME: Becomes a Slot method
    var fetchResults= function(slot, xrefList, fetchedFunc, finishedFunc) {
        var _next= function() {
            if (xrefList.length == 0) {
                finishedFunc();
                return;
            }
            var xref= xrefList.shift();
            if (hFetchResultAjax[slot.id]) {
                hFetchResultAjax[slot.id].abort();
                console.warn("STOPPED!!");
            }
            hFetchResultAjax[slot]= jQuery.ajax({
	        url: files_path + "/file" + xref.file_no + ".html",
                dataType: "html",
                complete: function(res, status) {
                    hFetchResultAjax[slot.id]= null;
                    if (status == "success" || status == "notmodified") {
                        fetchedFunc(xref, res.responseText);
                    };
                    _next();
                }
            });
        };
        _next();
    };

    var htmlize= function(text) {
        return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    var htmlize_filename= function(text) {
        return htmlize(text).replace(/\//g, '\/<wbr \/>');
    };

    var file= function(file_no) {
        if (files[file_no]) return files[file_no];
        return ['n/a', 'n/a', 'n/a'];
    };

    var showXref= function(token) {
        var slot= slotX;

        var xrefList= getXrefList(token);
        if (!xrefList) {
            console.log("token not found: " + token);
            return;
        }

        var result= [];
        for (var xrefList_i in xrefList) {
            var xref= xrefList[xrefList_i];
            result.push("<h1>" + htmlize_filename(file(xref.file_no)[2]) + "</h1><ol>");
            for (var line_no_i in xref.line_nos) {
                var line_no= xref.line_nos[line_no_i];
                var id= 'q' + slot.id + '-' + xref.file_no + '-' + line_no;
                var line= '<span id="' + id + '"><span class="loading">Loading</span></span>';
                result.push("<li><span class='line_no' rel='" + xref.file_no + ':' + line_no + "'>" + line_no + ".</span>" + line + "</li>");
            }
            result.push("</ol>");
        }
        showText(slot, "Xref for '" + token + "'", "<div class='code xref'>" + result.join("\n") + "</div>");

        fetchResults(slot, xrefList,
            function(xref, file_c) {
                var lines= file_c.split(/\n/);
                for (var i in xref.line_nos) {
                    var line_no= xref.line_nos[i];


                    // cache-problematik: loesung: erste zeile checken ob file stimmt, ansonsten nochmal holen mit _rnd=sdf
                    if (lines[line_no] == undefined) {
                        console.log(lines);
                        console.log(lines.length);
                        console.log(line_no);
                    }
                    
                    var line= line_no >= lines.length
                        ? line_no + " > " + lines.length + " ???"
                        : lines[line_no].substring(4, lines[line_no].length - 5); // remove <li> and </li>



                    var id= 'q' + slot.id + '-' + xref.file_no + '-' + line_no;
                    $('#' + id).html(line);
                }
            },
            function() {
                // showText(slot.id, "Xref for '" + token + "'", "<div class='code xref'>" + result.join("\n") + "</div>");
            }
        );
    };

    var showFile= function(slot, file_no, line_no) {
	jQuery.ajax({
	    url: files_path + "/file" + file_no + ".html",
	    dataType: "html",
	    complete: function(res, status){
		if (status == "success" || status == "notmodified") {
                    line_no= line_no > 0 ? line_no : 0;
            	    var $body= showText(slot,
                        "File '" + htmlize(file(file_no)[2]) + "'",
                        "<h1>" + htmlize_filename(file(file_no)[2]) + "</h1>" + res.responseText,
                        true);
                    $body.scrollTo(line_no <= 6 ? 0 : "li:nth-child(" + (line_no - 6)+ ")");
                    if (line_no) {
                        $body.find("li:nth-child(" + line_no + ")")
                            .css("backgroundColor", "#FF0")
                            .animate({ "backgroundColor": "#FFF" }, 3000)
                        ;
                    }
		};
                return this;
            }
        });
    };

    var showProject= function(slot) {
        var result= [];
        for (var section_i in sections) {
            var section= sections[section_i];
            result.push("<p><b ref='" + section_i + "'>" + section[1] + "</b></p>");
        }

        showText(slot, htmlize(project_title), "<div class='sections'>" + result.join("") + "</div>");
    };

    // var findProject= function(sectionsName) {
    // }

    var showSection= function(slot, section_i) {
        var section= sections[section_i];
        var result= [];
        var path= [];
        var last_path= null;
        var file_re= /^((.*)\/)?([^\/]+)$/;
        for (var file_i in files) {
            var file= files[file_i];
            if (file == null || file[3] != section_i) continue;

            var match= file_re.exec(file[2]);
            if (!match) {
                console.log("RegEx failed????");
                continue;
            }
            if (last_path != match[1]) {
                if (last_path) result.push("</ol>");
                last_path= match[1];
                result.push("<ol><li><h1>" + htmlize_filename(last_path) + "</h1></li>");
            }
            result.push("<li><b ref='" + file_i + "'>" + htmlize_filename(match[3]) + "</b></li>");
        }
        if (last_path) result.push("</ol>");

        showText(slot, "Section '" + section[1] + "'", "<div class='section'>" + result.join("") + "</div>");
    };

    showProject(slotP);

    // showFile(slotF, 120);
    // load: function( url, params, callback )
    // $('#slot0 .body').load("files/1.html");

    // General Hover
    $('.slot b, .code li .line_no')
        .live('mouseover', function(ev) {
            $(this).addClass("hover");
        })
        .live('mouseout', function(ev) {
            $(this).removeClass("hover");
        })
    ;

    // Project behaviours
    $('.project b')
        .live('click', function(ev) {
            showSection(slotS, $(this).attr("ref"));
        })
    ;

    // Section behaviours
    $('.section b')
        .live('click', function(ev) {
            showFile(slotF, $(this).attr("ref"));
        })
    ;

    // Code Token behaviours
    $('.code b')
        .live('mouseover', function(ev) {
            // var s= this.className.split(/\s+/)[0];
            $("._" + $(this).text()).addClass("over");
        })
        .live('mouseout', function(ev) {
            $("._" + $(this).text()).removeClass("over");
        })
        .live('click', function(ev) {

            // TODO: Visited link. Neat idea, but have to work this one out...
            $(this).css('background-color', 'yellow');

            showXref($(this).text());
        })
    ;

    // Code Line_no behaviours
    $('.code li .line_no')
        .live('click', function(ev) {
            $(this).css('background-color', 'yellow');
            var pos= $(this).attr('rel').split(':');
	    showFile(slotF, pos[0], pos[1]);
        })
    ;

    document.title= project_title + ' - Raxref';
});
