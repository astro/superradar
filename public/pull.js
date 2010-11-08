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
    // scramble so green is preferred
    rgb = [rgb[2], rgb[0], rgb[1]];

    var min = rgb[0], max = rgb[0];
    rgb.forEach(function(c) {
		    if (c < min)
			min = c;
		    if (c > max)
			max = c;
		});
    var r = '#';
    rgb.forEach(function(c) {
		    r += padLeft(2, '0',
				 (Math.round((c - min) * COLOR_RANGE / (max - min)) +
				  COLOR_OFFSET).toString(16));
		});
    return r;
}

function createEntryDiv(div, entry) {
    var linksByRel = {};
    entry.links.forEach(
	function(link) {
	    if (!linksByRel[link.rel])
		linksByRel[link.rel] = [];
	    linksByRel[link.rel].push(link);
	});
    var relLinks = function(rel) {
	return linksByRel[rel] || [];
    };

    if (div)
	div.contents().remove();
    else
	div = $('<div class="entry"></div>');

    /* Add data */
    div.data('rss', entry.rss);
    div.data('id', entry.id);
    div.data('published', Date.parse(entry.published));  // converts to local time
    div.data('serial', entry.serial);

    /* Add contents */
    var dateEl = $('<p class="date"></p>');
    dateEl.text(new Date(entry.published).toHuman());
    div.append(dateEl);

    var feedEl = $('<p class="source"><a></a></p>');
    feedEl.find('a').attr('href', entry.rss).
	text(entry.feedTitle ? entry.feedTitle : entry.rss);
    div.append(feedEl);

    relLinks('image').forEach(
	function(link) {
	    var imgEl = $('<img class="logo"/>');
	    imgEl.attr('src', link.href);
	    div.append(imgEl);
	});

    var titleEl = $('<p class="title"></p>');
    titleEl.text(entry.title);
    div.append(titleEl);

    var listEl = $('<ul class="links"></ul>');
    div.append(listEl);

    relLinks('alternate').forEach(
	function(link) {
	    var title = link.title || link.href;
	    if (title == entry.title)
		title = link.href;
	    var linkEl = $('<li><a></a></li>');
	    var aEl = linkEl.find('a');
	    aEl.attr('href', link.href);
	    aEl.text(title);
	    listEl.append(linkEl);
	});
    relLinks('enclosure').forEach(
	function(link) {
	    if (link.type.indexOf &&
		link.type.indexOf('image/') == 0) {
		var imgEl = $('<img/>');
		imgEl.attr('src', link.href);
		div.append(imgEl);
	    }
	});

    return div;
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

	      var div = null, isNew = true;
	      $('.entry').each(function() {
				    var div1 = $(this);
				    if (div1.data('rss') == entry.rss &&
					div1.data('id') == entry.id) {
					div = div1;
					isNew = false;
				    }
				});
	      div = createEntryDiv(div, entry);
	      if (isNew) {
		  var preceding, done = false;
		  /*var published = Date.parse(entry.published);
		  var p1s = document.getElementsByTagName('p');
		  for(var p1i in p1s) {
		      var p1 = p1s[p1i];
		      var published1 = $.data(p1, 'published');
		      if (published1) {
			  if (published1 > published)
			      preceding = p1;
			  else
			      break;
		      } else
			  console.log('no published '+p1.toString());
		  }*/

		  div.hide();
		  $('#content').prepend(div);
		  div.slideDown(500);
	      }
	  });

    /* Drop old */
    $('.entry').each(function() {
		    var div = $(this);
		    var pSerial = div.data('serial');
		    if (pSerial && pSerial <= serial - 100)
			div.remove();
		});

    /* Get next */
    window.setTimeout(function() {
			  pull(serial);
		      }, 100);

    console.log($('.entry').length + ' entries shown');
}

function pull(serial) {
  console.log("pull("+serial+")");
  $.ajax({ url: '/updates/' + serial,
	   success: function(content) {
	       try {
		   receiveContent(content);
	       } catch (e) {
		   console.log("Error: " + e.stack);
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

function insertStatusParagraph(status) {
  var p = $('<p class="entry status"/>');
  p.data('published', new Date().getTime());
  p.text(status);

  p.hide();
  $('#content').prepend(p);
  p.slideDown(1000);

  return p;
}

function subscribe(url) {
  if (!url)
    return;

  var status = insertStatusParagraph('Subscribing to ' + url);

  $.ajax({ url: '/subscribe',
	   type: 'POST',
	   dataType: 'text/plain',
	   data: url,
	   success: function() {
	     status.text('Successfully subscribed to ' + url);
	   },
	   error: function() {
	     status.text('Error subscribing to ' + url);
	   }
	 });
}

function setupAdmin() {
  $.ajax({ url: '/admincheck',
	   success: function(content) {
	     var admin = JSON.parse(content);
	     if (!admin)
	       return;
	     $('<p id="adder"><span id="plus">+</span></p>').insertBefore('h1');
	     $('#plus').click(function() {
				if ($('#subscribe').length > 0) {
				  $('#subscribe').remove();
				  $('#adder #plus').show();
				} else {
				  var input = $('<input/>', { id: 'subscribe',
							      size: 40 });
				  input.keypress(function(ev) {
						   if (ev.keyCode == '13') {
						     ev.preventDefault();
						     subscribe(input.val());
						     $('#subscribe').remove();
						     $('#adder #plus').show();
						   }
						 });
				  $('#adder').prepend(input);
				  input.focus();
				  $('#adder #plus').hide();
				}
			      });
	   }
	 });
}

$(document).ready(function() {
		    setupAdmin();
		    pull(-1);
		  });
