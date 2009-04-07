
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

    // *Sigh* Why isn't this a built-in if the sort function needs it?
    var strcmp= function(a, b) {
        if (a > b) return 1;
        if (a < b) return -1;
        return 0;
    };

    // Many colours are tedious in static css. Let's add the styles dynamically
    var initColorCss= function() {

        var hsvToHtml= function(h, s, v) {
            var hi = Math.floor((h % 360)/ 60);
            var f = (h % 360) / 60 - hi;
            var p = v * (1 - s);
            var q = v * (1 - s * f);
            var t = v * (1 - s * (1 - f));
            var rgb= [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][hi];
            return 'RGB(' + Math.floor(rgb[0] * 255) + ',' + Math.floor(rgb[1] * 255) + ',' + Math.floor(rgb[2] * 255) + ')';
        };

        // The %dd is the S and V part of the color. HSV is then calculated
        // with the formula d * 0.11 + 0.01, resulting in [0.01 .. 1]
        var styles= [
            '.slot.%t .slot-bg            { background-color: %49; }',
            '.slot.%t .slot-border        { border-color: %49 !important; }',
            '.slot.active.%t .slot-bg     { background-color: %99 !important; }',
            '.slot.active.%t .slot-border { border-color: %73 !important; }',
            '.slot.%t h1                  { color: %73; }',
            '.slot .to-%t b,       div.slot .link.to-%t        { background-color: %19; }',  // The "div." makes the style more important
            '.slot .to-%t b.over,  div.slot .link.over.to-%t   { background-color: %99 !important; }',  // Mouse-over
            '.slot .to-%t b.xover, div.slot .link.xover.to-%t  { background-color: %59; }',  // "xover" is for highlighting same tokens
            '.slot.%t .code .doc          { border-color: %49 }',
        ];

        var slots= { project: 0, section: 1, file: 3, xref: 4 };

        var css= '';
        for (var style_i in styles) {
            var style= styles[style_i];
            for (var slot_i in slots) {
                css += style.replace(/%t/g, slot_i).replace(/%(\d)(\d)/g, function(m) {
                    return hsvToHtml(slots[slot_i] * 60 + 40, m[1] * 0.11 + 0.01, m[2] * 0.11 + 0.01);
                }) + '\n';
            }
        }
        $('head').append($("<style type='text/css'>" + css + "</style>"));
    };

    // Builds a function that calls the function <fn> delayed by <ms> ms
    var DelayedFunc= function(ms, fn) {
        var hTimer;

        return function(arg) {
            if (hTimer) clearTimeout(hTimer);
            hTimer= setTimeout(function() {
                hTimer= null;
                fn(arg);
            }, ms);
        };
    };

    // Builds a function that manages parallel Ajax calls
    var ParallelFetch= function() {
        var fetchCount= 0;

        return function(instances, nextFn, completeFn) {
            var _next= function() {
                var next= nextFn();
                if (!next) return;
                
                var currentCount= fetchCount;
                jQuery.ajax({
                    url: next[0],
                    dataType: "html",
                    complete: function(res, status) {

                        // If the exec function was called again, stop bothering.
                        // I couldn't make Ajaxthingy.abort() work properly,
                        // so do it this way. 
                        if (currentCount < fetchCount) {
                            console.warn("parallelFetch: Ajax call aborted");
                            return;
                        }
                        if (status != "success" && status != "notmodified") {
                            // FIXME: Do something...
                            return;
                        };
                        completeFn(res, next[1]);
                        _next();
                    }
                });
            };

            fetchCount++;
            for (var i= 0; i < instances; i++) _next(i);
        };
    };

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
        var newDiv= $("<div id='slot" + id + "' class='slot " + type + "' ref='" + type + "'>"
                    +     "<div class='sizer'></div>"
                    +     "<div class='slot-i slot-bg round-corners'>"
                    +         "<div class='body-c slot-border round-corners'>"
                    +             "<div class='head-cc'><div class='head-c'><div class='head'></div></div></div>"
                    +             "<div class='filter-c'><div class='filter round-corners'>"
                    +                 "<input class='search-input' type='text' /><div class='closer'>[x]</div>"
                    +             "</div></div>"
                    +         "<div class='body slot-border round-corners'></div></div>"
                    +     "</div>"
                    + "</div>");

        $("#slots").prepend(newDiv);
        $("#slot" + id).data("slot", me);

        var sizerOfs;

        $("#slot" + id + " .sizer").draggable({
//            scroll: true,
//            containment: '#slots',
            helper: 'clone',
            axis: 'x',
            stack: { group: '#slots', min: 100 },
            start: function(event, ui) {
                sizerOfs= $("#slot" + id).width() - event.pageX;
            },
            drag: function(event, ui) {
                var w= sizerOfs + event.pageX;
                if (w < 40) {
                    $("#slot" + id).width(40).find(".body").hide();
                    return;
                }
                $("#slot" + id).width(w).find(".body").show();
            },
        });

        // TODO: Use this function on unload
        // $(window).bind('unload', function() { .. });
        var _destroy= function() {
            me= null;
            $("#slot" + id).data("slot", null);
        };

        var activate= function() {
            $(".slot").removeClass("active");
            $('#slot' + id).addClass("active");
            activeSlot= me;
        };

        // Return the input jObject
        var showFilter= function(show) {
            if (show) {
                $('#slot' + id).addClass('filter-on');
                return $('#slot' + id + ' .search-input');
            }
            $('#slot' + id).removeClass('filter-on');
            return $('#slot' + id + ' .search-input').val('').blur();
        };

        var _updateFilter= function() {
            var search= $('#slot' + id + ' .search-input').val().toLowerCase().replace(/^\s*(.*?)\s*$/, '$1');
            if (search == '') {
                $('#slot' + id + ' .body li').css('display', 'list-item')
                    .each(function(el_i, el) { el.value= el_i + 1; });  // I don't think it's possible to reset the value to "nothing"
                return;              
            }

            var $lastLiH1= null;
            var foundOne= false;

            var checkLastLiH1= function($el) {
                if (!$lastLiH1 || foundOne) return false;
                $lastLiH1.css('display', 'none');
                $lastLiH1= $el;
                return true;
            };
            
            $('#slot' + id + ' .body li').each(function(el_i, el) {

                var $el= $(el);
                if ($('h1', $el).length) {
                    $el.css('display', 'list-item');
                    if (checkLastLiH1($el)) return;
                    $lastLiH1= $el;
                    foundOne= false;
                    return;
                }

                var inx= $el.text().toLowerCase().indexOf(search);
                if (inx < 0) {
                    // var oldHtml= $el.html();
                    // var newHtml= oldHtml.replace(/<\/?u>/, '');
                    // if (oldHtml != newHtml) $el.html(newHtml);
                    $el.css('display', 'none');
                    return;
                }
                $el.css('display', 'list-item').attr('value', el_i + 1);
                foundOne= true;
            });
            checkLastLiH1();
        };

        var updateFilter= DelayedFunc(300, function() {
            _updateFilter();
        });

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

        var htmlize= function(text) {
            return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        };

        var htmlize_filename= function(text) {
            return htmlize(text).replace(/\//g, '\/<wbr \/>');
        };

        var filename= function(file_no) {
            if (files[file_no]) return files[file_no][2];
            return 'n/a';
        };

        var file_by_line= function(file_no, line_no) {

            // FIXME: ugly. make this 0 based
            line_no--;

            var fileinfo= files[file_no];
            var length= fileinfo[1];
            if (line_no >= length) return null;

            var file_split= fileinfo[0];
            var line_ofs= line_no % file_split;
            var start= line_no - line_ofs;

            return [ files_path + "/file" + file_no + "-" + (start / file_split) + ".html", line_ofs ];
        };

        var parallelFetch= ParallelFetch();

        var showXref= function(token) {

            var xrefList= getXrefList(token);
            if (!xrefList) {
                console.log("token not found: " + token);
                return;
            }

            // Change click on token to click on line
            var xref_re= new RegExp("(<b class='_" + token + ")(')", "g");

            var fetchedFunc= function(file_no, line_no, line) {
                line= line.replace(/^<li[^>]*>/, '').replace(/<\/li>$/, '')     // remove <li> and </li>
                    .replace(xref_re, '$1 link to-file$2');
                $('#q' + id + '-' + file_no + '-' + line_no).html(line);
            };

            var result= [];
            var fetch= [];
            var lastFile= null;
            
            for (var xrefList_i in xrefList) {
                var xref= xrefList[xrefList_i];
                result.push("<ol><li><h1>", htmlize_filename(filename(xref.file_no)), "</h1></li>");
                for (var line_no_i in xref.line_nos) {
                    var line_no= xref.line_nos[line_no_i];
                    result.push("<li>",
                        "<span class='line_no link to-file' rel='", xref.file_no, ':', line_no, "'>", line_no, ".</span>",
                        "<span id='q", id, '-', xref.file_no, '-', line_no, "'><span class='loading'>Loading</span></span>",
                        "</li>");
                    var filepos= file_by_line(xref.file_no, line_no);
                    if (filepos == null) {

                        // FIXME: cache-problematik: loesung: erste zeile checken ob file stimmt, ansonsten nochmal holen mit "cache: false"
                        // Laenger nicht mehr aufgetaucht, weiter beobachten...
                        fetchedFunc(file_no, line_no, "<li>Kaputt</li>");
                        continue;
                    }
                    if (filepos[0] != lastFile) {
                        lastFile= filepos[0];
                        fetch.push([ lastFile, [ xref.file_no, line_no, filepos[1] ] ]);
                        continue;
                    }
                    fetch[fetch.length - 1][1].push(xref.file_no, line_no, filepos[1]);
                }
                result.push("</ol>");
            }
            showText("Xref for '" + token + "'", "<div class='code xref simple-ol to-xref'>" + result.join("") + "</div>");

            var fetch_i= -1;

            parallelFetch( 8,   // Fetch 8 in parallel. Too many? Dunno...
                function() {
                    fetch_i++;
                    return fetch_i >= fetch.length ? null : fetch[fetch_i];
                },
                function(res, fetch_o) {
                    var lines= res.responseText.split(/\n/);
                    for (var i= 0; i < fetch_o.length; i += 3) {
                        var file_no= fetch_o[i];
                        var line_no= fetch_o[i + 1];
                        var line_ofs= fetch_o[i + 2];

                        fetchedFunc(file_no, line_no, line_ofs < lines.length ? lines[line_ofs] : line_ofs + " >= " + lines.length + " ???");
                    }
                }
            );
        };

        var showFileCount= 0;

        var showFile= function(file_no, line_no) {
            var length= files[file_no][1];
            var file_split= files[file_no][0];
            var start= 0;
            var part_no= 0;
            var collected= [ "<h1>", htmlize_filename(filename(file_no)), "</h1><div class='code to-xref'><ol>" ];

            var _done= function() {
                line_no= line_no > 0 ? line_no : 0;
                collected.push("</ol></div>");
                var $body= showText(
                    "File '" + htmlize(filename(file_no)) + "'",
                    collected.join(''),
                    true);
                $body.scrollTo(line_no <= 6 ? 0 : "li:nth-child(" + (line_no - 6)+ ")");
                if (line_no) {
                    $body.find("li:nth-child(" + line_no + ")")
                        .css("backgroundColor", "#FF0")
                        .animate({ "backgroundColor": "#FFF" }, 3000)
                    ;
                }
            };

            var currentCount= ++showFileCount;

            var _next= function() {
                jQuery.ajax({
                    url: files_path + "/file" + file_no + "-" + part_no + ".html",
                    dataType: "html",
                    complete: function(res, status){

                        // If showFile was called again, stop bothering.
                        if (currentCount < showFileCount) {
                            console.warn("showFile: Ajax call aborted");
                            return;
                        }

                        if (status != "success" && status != "notmodified") {
                            // FIXME: Do something!
                            return;
                        }

                        collected.push(res.responseText),
                        part_no++;
                        start += file_split;
                        if (start >= length) return _done();

                        _next();
                    }
                });
            };
            _next();
        };

        var showSection= function(section_i) {
            var section= sections[section_i];
            var file_re= /^((.*?)\/?)([^:\/]+)$/;
            var collects= [];
            for (var file_i in files) {
                var file= files[file_i];
                if (file == null || file[3] != section_i) continue;
                var match= file_re.exec(file[2]);
                if (!match) {
                    console.log("RegEx failed????");
                    continue;
                }
                collects.push([ file_i, match[2], match[3] ]);
            }
            collects.sort(function(a,b) { return strcmp(a[1], b[1]) || strcmp(a[2], b[2]); });

            var last_path= null;
            var result= [];
            for (var collect_i in collects) {
                var collect= collects[collect_i];
                var file_i= collect[0];
                var path= collect[1];
                var filename= collect[2];
                if (last_path != path) {
                    if (last_path) result.push("</ol>");
                    last_path= path;
                    result.push("<ol><li><h1>" + htmlize_filename(last_path) + "</h1></li>");
                }
                result.push("<li><b ref='" + file_i + "'>" + htmlize_filename(filename) + "</b></li>");
            }
            if (last_path) result.push("</ol>");

            showText("Section '" + section[1] + "'", "<div class='section simple-ol to-file'>" + result.join("") + "</div>");
        };

        var updateTokenSearch= DelayedFunc(300, function($this) {
            var $tokenSearch= $this.closest(".token-search");
            var search= $("input", $tokenSearch).val().toLowerCase();
            var searchLength= search.length;
            if (!searchLength) {
                $('.results', $tokenSearch).html("");
                return;
            }
            var result= [];
            for (var token in tokens) {
                var inx= token.toLowerCase().indexOf(search);
                if (inx >= 0) result.push([inx, token]);
            }
            result.sort(function(a, b) { return a[0] - b[0] || strcmp(a[1], b[1]) });
            for (var i in result) {
                if (i >= 10) {
                    var more= result.length - i;
                    result= result.slice(0, i);
                    result.push(more + " more...");
                    break;
                }
                var inx= result[i][0];
                var token= result[i][1];
                result[i]= "<b class='_" + quotemeta(token) + " link to-xref'>" + token.substr(0, inx)
                    + "<i>" + token.substr(inx, searchLength) + "</i>"
                    + token.substr(inx + searchLength) + "</b>";
            }
            $('.results', $tokenSearch).html(result.join("<br>"));
        });

        var showProject= function() {
            var result= [];
            for (var section_i in sections) {
                var section= sections[section_i];
                result.push("<li><b ref='" + section_i + "'>" + section[1] + "</b></li>");
            }

            showText(htmlize(project_title), ""
                + "<div class='token-search'>"
                +   "<h1>Tokens</h1>"
                +   "<form><input /></form>"
                +   "<div class='results code'></div>"
                + "</div>"
                + "<div class='sections simple-ol to-section'><ol>"
                +   "<li><h1>Sections</h1></li>"
                +   result.join("")
                + "</ol></div>"
            );
        };

        this.id= id;    // read only
        this.activate= activate;
        this.showXref= showXref;
        this.showFile= showFile;
        this.showProject= showProject;
        this.showSection= showSection;
        this.showFilter= showFilter;
        this.updateFilter= updateFilter;
        this.updateTokenSearch= updateTokenSearch;

        return this;
    };

    initColorCss();

    Slot.nextId= 0;

    var slotX= new Slot('xref');
    var slotF= new Slot('file');
    var slotS= new Slot('section');
    var slotP= new Slot('project');

    slotP.showProject();

    $('.slot')
        .live('mousedown', function(ev) {
            if (!ev.button) $(this).data("slot").activate();
        })
    ;

    // General Hover
    $('.slot b, .slot .link')
        .live('mouseover', function(ev) {
            $(this).addClass("over");
        })
        .live('mouseout', function(ev) {
            $(this).removeClass("over");
        })
    ;

    // Project behaviours
    $('.project .sections b')
        .live('click', function(ev) {
            if (!ev.button) slotS.showSection($(this).attr("ref"));
        })
    ;

    // Section behaviours
    $('.section b')
        .live('click', function(ev) {
            if (!ev.button) slotF.showFile($(this).attr("ref"));
        })
    ;

    var quotemeta= function(s) {
        return s.replace(/([^-a-zA-Z0-9_])/g, '\\$1');
    };

    var markVisited= function($el) {

        // TODO: Visited link. Neat idea, but have to work this one out...
        $el.css('background-color', 'yellow');
    };

    var clickLineNo= function($el) {
        markVisited($el);
        var pos= $el.attr('rel').split(':');
        if (pos.length > 1) slotF.showFile(pos[0], pos[1]);
    };

    // Code Token behaviours
    $('.code b, .code .link')
        .live('mouseover', function(ev) {
            $("._" + quotemeta($(this).text())).addClass("xover");
        })
        .live('mouseout', function(ev) {
            $("._" + quotemeta($(this).text())).removeClass("xover");
        })
        .live('click', function(ev) {
            if (ev.button) return;

            var $this= $(this);
            if ($this.hasClass('link')) {
                var $el= $('.line_no', $this.closest('li'));
                if ($el.length) {
                    clickLineNo($el);
                    return;
                }
            }
            markVisited($this);
            slotX.showXref($this.text());
        })
    ;

    // Code Line_no behaviours
    $('.code li .line_no')
        .live('click', function(ev) {
            if (!ev.button) clickLineNo($(this));
        })
    ;

    // FIXME: MUST be live()

    // Track active input element
    $('input')
        .focus(function(ev) {
            activeElement= this;
        })
        .blur(function(ev) {
            activeElement= null;
        })
        .keyup(function(ev) {
            if (activeSlot) activeSlot.updateFilter();
        })
    ;

    $('.token-search input')
        .keyup(function(ev) {
            if (ev.keyCode == 27) this.value= "";
            if (activeSlot) activeSlot.updateTokenSearch($(this));
        })
    ;

    $('.filter .closer')
        .live("click", function(ev) {
            if (ev.button) return;
            var el= $(this).closest('.slot');
            var slot= el.data("slot");
            if (!slot) return;
            slot.showFilter(false);
            slot.updateFilter();
        })
    ;

    // Catch keyboard inputs and display fast search
    $(window)
        .keydown(function(ev) {

            // Ugh. Keycodes are alchemy. I just can't be bothered to fix the special cases...
            if (activeSlot && !activeElement && ev.keyCode >= 48 && ev.keyCode < 91 && !ev.altKey && !ev.ctrlKey) {
                activeSlot.showFilter(true).focus();
                return;
            }
        })
        .keyup(function(ev) {
            if (activeSlot && activeElement && (ev.keyCode == 27 || (ev.keyCode == 8 && activeElement.value == ''))) {
                if ($(ev.target).closest('.filter').length) activeSlot.showFilter(false);
                return true;
            }
        })
    ;

    document.title= project_title + ' - Raxref';
});
