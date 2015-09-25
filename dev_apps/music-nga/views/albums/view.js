/* global bridge, View */
'use strict';

var debug = 1 ? (...args) => console.log('[AlbumsView]', ...args) : () => {};

var AlbumsView = View.extend(function AlbumsView() {
  View.call(this); // super();

  this.search = document.getElementById('search');
  this.list = document.getElementById('list');

  var searchHeight = this.search.offsetHeight;

  this.search.addEventListener('open', () => window.parent.onSearchOpen());
  this.search.addEventListener('close', () => {
    this.list.scrollTop = searchHeight;
    window.parent.onSearchClose();
  });

  this.list.scrollTop = searchHeight;
  this.list.minScrollHeight = `calc(100% - ${searchHeight}px)`;

  this.list.configure({
    getSectionName(item) {
      var album = item.metadata.album;
      return album ? album[0].toUpperCase() : '?';
    }
  });

  this.client.on('databaseChange', () => this.update());

  this.update();
});

AlbumsView.prototype.update = function() {
  this.getAlbums().then((albums) => {
    this.albums = albums;
    this.render();
  });
};

AlbumsView.prototype.destroy = function() {
  this.client.destroy();

  View.prototype.destroy.call(this); // super(); // Always call *last*
};

AlbumsView.prototype.render = function() {
  View.prototype.render.call(this); // super();

  this.list.model = this.albums;
};

AlbumsView.prototype.getAlbums = function() {
  return this.fetch('/api/albums/list')
    .then(response => response.json())
    .then(albums => clean(albums));
};

function clean(items) {
  debug('clean', items);
  return items.map(item => {
    if (!item.metadata.album) item.metadata.album = '?';
    return item;
  });
}

window.view = new AlbumsView();