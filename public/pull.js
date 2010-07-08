if (!console)
    var console = {
	log: function() { }
    };

function padLeft(len, padding, s) {
    s = s.toString();
    while(s.length < len) {
	s = padding + s;
    }
    return s;
}
Date.prototype.toHuman = function() {
    return this.getFullYear() + '-' +
	padLeft(2, '0', this.getMonth() + 1) + '-' +
	padLeft(2, '0', this.getDate()) + ' ' +
	padLeft(2, '0', this.getHours()) + ':' +
	padLeft(2, '0', this.getMinutes()) + ':' +
	padLeft(2, '0', this.getSeconds());
};

var COLOR_OFFSET = 128;
var COLOR_RANGE = 127;
function generateColor(s) {
    var rgb = [0, 0, 0], p = 0;
    for(var i = 0; i < s.length; i++) {
	rgb[p] += s.charCodeAt(i);
	p = (p + 1) % 3;
    }
    var r = '#';
    rgb.forEach(function(c) {
		    r += padLeft(2, '0', ((c % COLOR_RANGE) + COLOR_OFFSET).toString(16));
		});
    return r;
}

function createEntryParagraph(p, entry) {
    var linksByRel = {};
    entry.links.forEach(
	function(link) {
	    if (!linksByRel[link.rel])
		linksByRel[link.rel] = [];
	    linksByRel[link.rel].push(link);
	});
    relLinks = function(rel) {
	return linksByRel[rel] || [];
    };

    if (p)
	p.contents().remove();
    else
	p = $('<p class="entry"></p>');

    /* Add data */
    p.data('rss', entry.rss);
    p.data('id', entry.id);
    p.data('published', Date.parse(entry.published));  // converts to local time
    p.data('serial', entry.serial);

    /* Add contents */
    p.css('background-color', generateColor(entry.rss));
    relLinks('image').forEach(
	function(link) {
	    var imgEl = $('<img/>');
	    imgEl.attr('src', link.href);
	    p.append(imgEl);
	});	    

    var feedEl = $('<a class="feed"></a>');
    feedEl.attr('href', entry.rss);
    feedEl.text(entry.feedTitle ? entry.feedTitle : entry.rss);
    p.append(feedEl);
    
    var dateEl = $('<span class="date"></span>');
    dateEl.text(new Date(entry.published).toHuman());
    p.append(dateEl);
    p.append('<br/>');

    var titleEl = $('<span class="title"></span>');
    titleEl.text(entry.title);
    p.append(titleEl);
    p.append('<br/>');

    relLinks('alternate').forEach(
	function(link) {
	    var title = link.title || link.href;
	    if (title == entry.title)
		title = link.href;
	    var linkEl = $('<a class="link"></a>');
	    linkEl.attr('href', link.href);
	    linkEl.text(title);
	    p.append(linkEl);
	    p.append('<br/>');
	});

    return p;
}

function receiveContent(content) {
    var entries = JSON.parse(content);
    var serial = -1;
    console.log(entries.length + " entries pulled");

    /* Add each entry */
    $.map(entries,
	  function(entry) {
	      /* update max serial */
	      if (entry.serial > serial)
		  serial = entry.serial;
	      /* fix date */
	      if (isNaN(Date.parse(entry.published)))
		  entry.published = new Date().toString();

	      var p = null, isNew = true;
	      $('p.entry').each(function() {
				    var p1 = $(this);
				    if (p1.data('rss') == entry.rss &&
					p1.data('id') == entry.id) {
					p = p1;
					isNew = false;
				    }
				});
	      p = createEntryParagraph(p, entry);
	      if (isNew) {
		  var preceding = 'h1', done = false;
		  $('p.entry').each(function() {
					if (!done) {
					    var published = $.data(this, 'published');
					    if (published) {
						if (published < p.data('published'))
						    preceding = $(this);
						else
						    done = true;
					    } else {
						// FIX:
						console.log('p w/o data: '+p1);
					    }
					}
				    });

		  p.hide();
		  p.insertAfter(preceding);
		  p.slideDown(500);
	      }
	  });

    /* Drop old */
    $('p.entry').each(function() {
		    var p = $(this);
		    var pSerial = p.data('serial');
		    if (pSerial && pSerial <= serial - 100)
			p.remove();
		});

    /* Get next */
    window.setTimeout(function() {
			  pull(serial);
		      }, 100);

    console.log($('p.entry').length + ' entries shown');
}

function pull(serial) {
  console.log("pull("+serial+")");
  $.ajax({ url: '/updates/' + serial,
	   success: function(content) {
	       try {
		   receiveContent(content);
	       } catch (e) {
		   console.log("Error: " + e);
		   window.setTimeout(function() {
					 pull(-1);
				     }, 1000);
	       }
	   },
	   error: function(req, status) {
	       console.log("Error: " + status);
	       window.setTimeout(function() {
				     pull(-1);
				 }, 1000);
	   }
	 });
}

$(document).ready(function() {
		    pull(-1);
		  });
