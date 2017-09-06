import h from 'hyperscript';

import paginate from './paginate';
import Styler from './Styler';
import Viewer from './Viewer';
import c from './utils/prefixClass';

import Rules from './Rules/';
import UserOption from './UserOption';

require('./_style/main.scss');

const defaultPageSetup = {
  bleed: '12pt',
  size: { width: '288pt', height: '432pt' },
  margin: {
    inner: '24pt',
    outer: '24pt',
    bottom: '40pt',
    top: '48pt',
  },
};

class Bindery {
  constructor(opts) {
    console.log(`Bindery ${'[AIV]{version}[/AIV]'}`);

    this.autorun = opts.autorun || true;
    this.autoupdate = opts.autoupdate || false;
    this.debug = opts.debug || false;

    this.styler = new Styler();

    UserOption.validate(opts, {
      name: 'makeBook',
      autorun: UserOption.bool,
      content: UserOption.any,
      pageSetup: UserOption.shape({
        name: 'pageSetup',
        bleed: UserOption.string,
        margin: UserOption.shape({
          name: 'margin',
          top: UserOption.string,
          inner: UserOption.string,
          outer: UserOption.string,
          bottom: UserOption.string,
        }),
        size: UserOption.shape({
          name: 'size',
          width: UserOption.string,
          height: UserOption.string,
        }),
      }),
      rules: UserOption.array,
    });

    if (opts.pageSetup) {
      this.styler.setSize(opts.pageSetup.size || defaultPageSetup.size);
      this.styler.setMargin(opts.pageSetup.margin || defaultPageSetup.margin);
      this.styler.setBleed(opts.pageSetup.bleed || defaultPageSetup.bleed);
    } else {
      this.styler.setSize(defaultPageSetup.size);
      this.styler.setMargin(defaultPageSetup.margin);
      this.styler.setBleed(defaultPageSetup.bleed);
    }

    this.viewer = new Viewer({ bindery: this });
    this.controls = this.viewer.controls;

    if (opts.startingView) {
      this.viewer.setMode(opts.startingView);
    }

    this.rules = [];
    if (opts.rules) this.addRules(opts.rules);


    if (!opts.content) {
      this.viewer.displayError('Content not specified', 'You must include a source element, selector, or url');
      console.error('Bindery: You must include a source element or selector');
    } else if (typeof opts.content === 'string') {
      this.source = document.querySelector(opts.content);
      if (!(this.source instanceof HTMLElement)) {
        this.viewer.displayError('Content not specified', `Could not find element that matches selector "${opts.content}"`);
        console.error(`Bindery: Could not find element that matches selector "${opts.content}"`);
        return;
      }
      if (this.autorun) {
        this.makeBook();
      }
    } else if (typeof opts.content === 'object' && opts.content.url) {
      const url = opts.content.url;
      const selector = opts.content.selector;
      this.fetchSource(url, selector);
    } else if (opts.content instanceof HTMLElement) {
      this.source = opts.content;
      if (this.autorun) {
        this.makeBook();
      }
    } else {
      console.error('Bindery: Source must be an element or selector');
    }
  }

  // Convenience constructor
  static makeBook(opts = {}) {
    opts.autorun = opts.autorun ? opts.autorun : true;
    return new Bindery(opts);
  }

  fetchSource(url, selector) {
    fetch(url).then((response) => {
      if (response.status === 404) {
        this.viewer.displayError('404', `Could not find file at "${url}"`);
      } else if (response.status === 200) {
        return response.text();
      }
      return '';
    }).then((fetchedContent) => {
      const wrapper = h('div');
      wrapper.innerHTML = fetchedContent;
      this.source = wrapper.querySelector(selector);
      if (!(this.source instanceof HTMLElement)) {
        this.viewer.displayError(
          'Source not specified',
          `Could not find element that matches selector "${selector}"`
        );
        console.error(`Bindery: Could not find element that matches selector "${selector}"`);
        return;
      }
      if (this.autorun) {
        this.makeBook();
      }
    }).catch((error) => {
      console.error(error);
      const scheme = window.location.href.split('://')[0];
      if (scheme === 'file') {
        this.viewer.displayError(
          `Can't fetch content from "${url}"`,
          'Web pages can\'t fetch content unless they are on a server.'
        );
      }
    });
  }

  cancel() {
    this.viewer.cancel();
    document.body.classList.remove(c('viewing'));
    this.source.style.display = '';
  }

  addRules(newRules) {
    newRules.forEach((rule) => {
      if (rule instanceof Rules.Rule) {
        this.rules.push(rule);
      } else {
        throw Error(`Bindery: The following is not an instance of Bindery.Rule and will be ignored: ${rule}`);
      }
    });
  }

  makeBook(doneBinding) {
    if (!this.source) {
      document.body.classList.add(c('viewing'));
      return;
    }

    if (!this.styler.isSizeValid()) {
      this.viewer.displayError(
        'Page is too small', `Size: ${JSON.stringify(this.pageSize)} \n Margin: ${JSON.stringify(this.pageMargin)} \n Try adjusting the sizes or units.`
      );
      console.error('Bindery: Cancelled pagination. Page is too small.');
      return;
    }

    this.source.style.display = '';
    const content = this.source.cloneNode(true);
    this.source.style.display = 'none';

    // In case we're updating an existing layout
    this.viewer.clear();

    document.body.classList.add(c('viewing'));
    this.viewer.element.classList.add(c('in-progress'));
    if (this.debug) document.body.classList.add(c('debug'));

    this.styler.updateStylesheet();

    this.controls.setInProgress();

    paginate({
      content,
      rules: this.rules,
      success: (book) => {
        this.viewer.book = book;
        this.viewer.render();

        this.controls.setDone();
        if (doneBinding) doneBinding();
        this.viewer.element.classList.remove(c('in-progress'));
        document.body.classList.remove(c('debug'));
      },
      progress: (book) => {
        this.viewer.book = book;
        this.controls.updateProgress(book.pages.length);
        this.viewer.renderProgress();
      },
      error: (error) => {
        this.viewer.element.classList.remove(c('in-progress'));
        this.viewer.displayError('Layout couldn\'t complete', error);
      },
      isDebugging: this.debug,
    });
  }
}


Object.keys(Rules).forEach((rule) => {
  Bindery[rule] = Rules[rule];
});

module.exports = Bindery;
