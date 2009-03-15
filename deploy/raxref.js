
// Raxref.js - The JavaScript Runtime library of Raxref

// Author: Dietrich Raisin, info1@raisin.de
// License: see LICENSE file

// Fall back if Firebug is not present
if (typeof console == 'undefined') {
    var console= { log: function() {}, warn: function() {}, error: function() {} };
}

jQuery(function($) {

    var activeSlot= null;
    var activeElement= null;

    var Slot= function(type) {

        // BTW: This is the most packer-friendly way writing JS Classes I found:
        // Write everything as private code at make the assignments to the
        // properties at the very end. Both yuicomressor and dojocompressor are
        // very happy with this style. Other libraries mess this up terribly,
        // e.g. jQueryUI (especially the calendar is EVIL - could be half the
        // size) Dunno why...

        var me= this;
        var id= Slot.nextId++;

        // The HTML here turned out a bit complicated, but I find it REALLY hard to make CSS work with percentage values
        // even on modern browsers.
        var newDiv= $("<div id='slot" + id + "' class='slot " + type + " filter-onx' ref='" + type + "'>"
                        + "<div class='slot-i slot-bg round-corners'>"
                            + "<div class='body-c slot-border round-corners'>"
                                + "<div class='head-c'><div class='head'></div></div>"
                                + "<div class='filter-c'><div class='filter round-corners'>"
                                    + "<input class='search-input' type='text' /><div class='closer'>[x]</div>"
                                + "</div></div>"
                            + "<div class='body slot-border round-corners'></div></div>"
                        + "</div>"
                    + "</div>");

        $("#slots").prepend(newDiv);
        $("#slot" + id).data("slot", me);

        // TODO: Use this function on unload
        var _destroy= function() {
            me= null;
            $("#slot" + id).data("slot", me);
        };

        var activate= function() {
            $(".slot").removeClass("active");
            $('#slot' + id).addClass("active");
            activeSlot= me;
        };

        var showFilter= function(show) {
            if (show) {
                $('#slot' + id).addClass('filter-on');
            }
            else {
                $('#slot' + id).removeClass('filter-on');
            }
            return $('#slot' + id + ' .search-input');
        };

        var showText= function(titleHtml, bodyHtml, omitScrollToTop) {
            $('#slot' + id + ' .head').html(titleHtml);
            activate();
            var $body= $('#slot' + id + ' .body').html(bodyHtml);
            if (!omitScrollToTop) $body.scrollTo(0);
            return $body;
        };

        var getXrefList= function(token) {
            var rawXref= tokens[token];
            if (!rawXref) return null;

            var xrefList= [];
            var xref= { file_no: 0, line_nos: [] };
            var last_file_no= 0;
            var last_line_no= 0;
            var v= 0;
            var rawXref_length= rawXref.length;
            for (var i= 0; i < rawXref_length; i++) {
                var c= rawXref.charCodeAt(i) - 32;
                if (c == 94) c= rawXref.charCodeAt(++i) - 31;
                c ^= 24;
                var flag= c % 3;
                c= Math.floor(c / 3);
                v= v * 32 + c;
                if (flag == 2) {
                    last_file_no += v;
                    if (xref.line_nos.length) xrefList.push(xref);
                    xref= { file_no: last_file_no, line_nos: [] };
                    last_line_no= 0;
                    v= 0;
                }
                else if (flag == 1) {
                    last_line_no += v;
                    xref.line_nos.push(last_line_no);
                    v= 0;
                }
            }
            
            if (v) console.error("V MUST BE 0!!");
            
            if (xref.line_nos.length) xrefList.push(xref);
            return xrefList;
        };

        var iFetchResultCount= 0;

        var fetchResults= function(xrefList, fetchedFunc, finishedFunc) {
            var iCurrentCount= ++iFetchResultCount;
            var _next= function() {
                if (xrefList.length == 0) {
                    finishedFunc();
                    return;
                }
                var xref= xrefList.shift();
                jQuery.ajax({
                    url: files_path + "/file" + xref.file_no + ".html?" + Math.random(),
                    dataType: "html",
                    complete: function(res, status) {

                        // If new fetchResult was called, stop bothering.
                        // I couldn't make Ajaxthingy.abort() working, properly,
                        // so do it this way. 
                        if (iCurrentCount < iFetchResultCount) {
                            console.warn("Ajax call aborted");
                            return;
                        }

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
                    var spanId= 'q' + id + '-' + xref.file_no + '-' + line_no;
                    var line= '<span id="' + spanId + '"><span class="loading">Loading</span></span>';
                    result.push("<li><span class='line_no' rel='" + xref.file_no + ':' + line_no + "'>" + line_no + ".</span>" + line + "</li>");
                }
                result.push("</ol>");
            }
            showText("Xref for '" + token + "'", "<div class='code xref'>" + result.join("\n") + "</div>");

            fetchResults(xrefList,
                function(xref, file_c) {
                    var lines= file_c.split(/\n/);
                    for (var i in xref.line_nos) {
                        var line_no= xref.line_nos[i];


                        // cache-problematik: loesung: erste zeile checken ob file stimmt, ansonsten nochmal holen mit _rnd=sdf
                        if (lines[line_no] == undefined) {
                            // console.log(lines);
                            console.log(lines.length, line_no);
                        }

                        var line;
                        if (line_no >= lines.length) {
                            line= line_no + " > " + lines.length + " ???";
                        }
                        else {
                            line= lines[line_no].replace(/^<li[^>]+>/, '').replace(/<\/li>$/, '');      // remove <li> and </li>
                        }

                        var spanId= 'q' + id + '-' + xref.file_no + '-' + line_no;
                        $('#' + spanId).html(line);
                    }
                },
                function() {
                    // showText("Xref for '" + token + "'", "<div class='code xref'>" + result.join("\n") + "</div>");
                }
            );
        };

        var showFile= function(file_no, line_no) {
        jQuery.ajax({
            url: files_path + "/file" + file_no + ".html",
            dataType: "html",
            complete: function(res, status){
            if (status == "success" || status == "notmodified") {
                        line_no= line_no > 0 ? line_no : 0;
                        var $body= showText(
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

        var showProject= function() {
            var result= [];
            for (var section_i in sections) {
                var section= sections[section_i];
                result.push("<p><b ref='" + section_i + "'>" + section[1] + "</b></p>");
            }

            showText(htmlize(project_title), "<div class='sections'>" + result.join("") + "</div>");
        };

        // var findProject= function(sectionsName) {
        // }

        var showSection= function(section_i) {
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

            showText("Section '" + section[1] + "'", "<div class='section'>" + result.join("") + "</div>");
        };

        this.id= id;    // read only
        this.activate= activate;
        this.showXref= showXref;
        this.showFile= showFile;
        this.showProject= showProject;
        this.showSection= showSection;
        this.showFilter= showFilter;

        return this;
    };

    Slot.nextId= 0;

    var slotX= new Slot('xref');
    var slotF= new Slot('file');
    var slotS= new Slot('section');
    var slotP= new Slot('project');

    slotP.showProject(  );

    // showFile(slotF, 120);
    // load: function( url, params, callback )
    // $('#slot0 .body').load("files/1.html");

    $('.slot')
        .live('mousedown', function(ev) {
            $(this).data("slot").activate();
        })
    ;

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
            slotS.showSection($(this).attr("ref"));
        })
    ;

    // Section behaviours
    $('.section b')
        .live('click', function(ev) {
            slotF.showFile($(this).attr("ref"));
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

            slotX.showXref($(this).text());
        })
    ;

    // Code Line_no behaviours
    $('.code li .line_no')
        .live('click', function(ev) {
            $(this).css('background-color', 'yellow');
            var pos= $(this).attr('rel').split(':');
            slotF.showFile(pos[0], pos[1]);
        })
    ;

    // Track active input element
    $('input').focus(function(ev) {
            activeElement= this;
        })
        .blur(function(ev) {
            activeElement= null;
        })
        .keypress(function(ev) {
            if (activeSlot) {
                console.log("!!!");
            }
        })
    ;

    // Catch keyboard inputs and display fast search
    $(window).keydown(function(ev, a, b, c) {
        if (activeSlot) {

            // Ugh. Keycodes are alchemy. I just can't be bothered to fix the special cases...
            if (!activeElement && ev.keyCode >= 48 && ev.keyCode < 91) {
                activeSlot.showFilter(true).focus();
                return;
            }
            if (activeElement && ev.keyCode == 27) {
                activeSlot.showFilter(false);
                activeElement.value= '';
                activeElement.blur();
            }
        }
    });

    document.title= project_title + ' - Raxref';
});
