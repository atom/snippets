const path = require('path');
const fs = require('fs-plus');
const temp = require('temp').track();

describe("Snippet Loading", () => {
  let configDirPath, snippetsService, defaultContext;

  beforeEach(() => {
    configDirPath = temp.mkdirSync('atom-config-dir-');
    spyOn(atom, 'getConfigDirPath').andReturn(configDirPath);

    spyOn(console, 'warn');
    if (atom.notifications != null) { spyOn(atom.notifications, 'addError'); }

    spyOn(atom.packages, 'getLoadedPackages').andReturn([
      atom.packages.loadPackage(path.join(__dirname, 'fixtures', 'package-with-snippets')),
      atom.packages.loadPackage(path.join(__dirname, 'fixtures', 'package-with-broken-snippets')),
    ]);
  });

  afterEach(() => {
    waitsForPromise(() => Promise.resolve(atom.packages.deactivatePackages('snippets')));
    runs(() => {
      jasmine.unspy(atom.packages, 'getLoadedPackages');
    });
  });

  const activateSnippetsPackage = () => {
    waitsForPromise(() => atom.packages.activatePackage("snippets").then(({mainModule}) => {
      snippetsService = mainModule.provideSnippets();
      mainModule.loaded = false;
    }));

    waitsFor("all snippets to load", 3000, () => snippetsService.bundledSnippetsLoaded());
  };

  it("loads the bundled snippet template snippets", () => {
    activateSnippetsPackage();

    runs(() => {
      const jsonSnippet = snippetsService.snippetsForScopes(['.source.json'])['snip'];
      let instance = jsonSnippet.generateInstance();
      expect(jsonSnippet.name).toBe('Atom Snippet');
      expect(jsonSnippet.prefix).toBe('snip');
      expect(instance.bodyText).toContain('"prefix":');
      expect(instance.bodyText).toContain('"body":');
      expect(instance.tabStopList.length).toBeGreaterThan(0);

      const csonSnippet = snippetsService.snippetsForScopes(['.source.coffee'])['snip'];
      instance = csonSnippet.generateInstance();
      expect(csonSnippet.name).toBe('Atom Snippet');
      expect(csonSnippet.prefix).toBe('snip');
      expect(instance.bodyText).toContain("'prefix':");
      expect(instance.bodyText).toContain("'body':");
      expect(instance.tabStopList.length).toBeGreaterThan(0);
    });
  });

  it("loads non-hidden snippet files from atom packages with snippets directories", () => {
    activateSnippetsPackage();

    runs(() => {
      let snippet = snippetsService.snippetsForScopes(['.test'])['test'];
      let instance = snippet.generateInstance();
      expect(snippet.prefix).toBe('test');
      expect(instance.bodyText).toBe('testing 123');

      snippet = snippetsService.snippetsForScopes(['.test'])['testd'];
      instance = snippet.generateInstance();
      expect(snippet.prefix).toBe('testd');
      expect(snippet.description).toBe('a description');
      expect(snippet.descriptionMoreURL).toBe('http://google.com');
      expect(instance.bodyText).toBe('testing 456');

      snippet = snippetsService.snippetsForScopes(['.test'])['testlabelleft'];
      instance = snippet.generateInstance();
      expect(snippet.prefix).toBe('testlabelleft');
      expect(snippet.leftLabel).toBe('a label');
      expect(instance.bodyText).toBe('testing 456');


      snippet = snippetsService.snippetsForScopes(['.test'])['testhtmllabels'];
      instance = snippet.generateInstance();
      expect(snippet.prefix).toBe('testhtmllabels');
      expect(snippet.leftLabelHTML).toBe('<span style=\"color:red\">Label</span>');
      expect(snippet.rightLabelHTML).toBe('<span style=\"color:white\">Label</span>');
      expect(instance.bodyText).toBe('testing 456');
    });
  });

  it("logs a warning if package snippets files cannot be parsed", () => {
    activateSnippetsPackage();

    runs(() => {
      // Warn about invalid-file, but don't even try to parse a hidden file
      expect(console.warn.calls.length).toBeGreaterThan(0);
      expect(console.warn.mostRecentCall.args[0]).toMatch(/Error reading.*package-with-broken-snippets/);
    });
  });

  describe("::loadPackageSnippets(callback)", () => {
    beforeEach(() => { // simulate a list of packages where the javascript core package is returned at the end
       atom.packages.getLoadedPackages.andReturn([
        atom.packages.loadPackage(path.join(__dirname, 'fixtures', 'package-with-snippets')),
        atom.packages.loadPackage('language-javascript')
      ])
    });

    it("allows other packages to override core packages' snippets", () => {
      waitsForPromise(() => atom.packages.activatePackage("language-javascript"));

      activateSnippetsPackage();

      runs(() => {
        expect(atom.packages.getLoadedPackages().length).toBe(2);
        expect(atom.packages.isPackageLoaded("package-with-snippets")).toBe(true);
        expect(atom.packages.isPackageLoaded("language-javascript")).toBe(true);

        const snippet = snippetsService.snippetsForScopes([".source.js"])["log"];
        expect(snippet.generateInstance().bodyText).toBe("from-a-community-package");
      });
    });
  });

  describe("::onDidLoadSnippets(callback)", () => {
    it("invokes listeners when all snippets are loaded", () => {
      let loadedCallback = null;

      waitsFor("package to activate", done => atom.packages.activatePackage("snippets").then(({mainModule}) => {
        mainModule.onDidLoadSnippets(loadedCallback = jasmine.createSpy('onDidLoadSnippets callback'));
        done();
      }));

      waitsFor("onDidLoad callback to be called", () => loadedCallback.callCount > 0);
    });
  });

  describe("when ~/.atom/snippets.json exists", () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(configDirPath, 'snippets.json'), `\
{
  ".foo": {
    "foo snippet": {
      "prefix": "foo",
      "body": "bar1"
    }
  }
}\
`
      );
      activateSnippetsPackage();
    });

    it("loads the snippets from that file", () => {
      let snippet = null;

      waitsFor(() => snippet = snippetsService.snippetsForScopes(['.foo'])['foo']);

      runs(() => {
        expect(snippet.name).toBe('foo snippet');
        expect(snippet.prefix).toBe("foo");
        expect(snippet.generateInstance().bodyText).toBe("bar1");
      });
    });

    describe("when that file changes", () => {
      it("reloads the snippets", () => {
        fs.writeFileSync(path.join(configDirPath, 'snippets.json'), `\
{
".foo": {
  "foo snippet": {
    "prefix": "foo",
    "body": "bar2"
  }
}
}\
`
        );

        waitsFor("snippets to be changed", () => {
          const snippet = snippetsService.snippetsForScopes(['.foo'])['foo'];
          return snippet && snippet.generateInstance().bodyText === 'bar2';
        });

        runs(() => {
          fs.writeFileSync(path.join(configDirPath, 'snippets.json'), "");
        });

        waitsFor("snippets to be removed", () => !snippetsService.snippetsForScopes(['.foo'])['foo']);
      });
    });
  });

  describe("when ~/.atom/snippets.cson exists", () => {
    beforeEach(() => {
      fs.writeFileSync(path.join(configDirPath, 'snippets.cson'), `\
".foo":
  "foo snippet":
    "prefix": "foo"
    "body": "bar1"\
`
      );
      activateSnippetsPackage();
    });

    it("loads the snippets from that file", () => {
      let snippet = null;

      waitsFor(() => snippet = snippetsService.snippetsForScopes(['.foo'])['foo']);

      runs(() => {
        expect(snippet.name).toBe('foo snippet');
        expect(snippet.prefix).toBe("foo");
        expect(snippet.generateInstance().bodyText).toBe("bar1");
      });
    });

    describe("when that file changes", () => {
      it("reloads the snippets", () => {
        fs.writeFileSync(path.join(configDirPath, 'snippets.cson'), `\
".foo":
  "foo snippet":
    "prefix": "foo"
    "body": "bar2"\
`
        );

        waitsFor("snippets to be changed", () => {
          const snippet = snippetsService.snippetsForScopes(['.foo'])['foo'];
          return snippet && snippet.generateInstance().bodyText === 'bar2';
        });

        runs(() => {
          fs.writeFileSync(path.join(configDirPath, 'snippets.cson'), "");
        });

        waitsFor("snippets to be removed", () => {
          const snippet = snippetsService.snippetsForScopes(['.foo'])['foo'];
          return snippet == null;
        });
      });
    });
  });

  it("notifies the user when the user snippets file cannot be loaded", () => {
    fs.writeFileSync(path.join(configDirPath, 'snippets.cson'), '".junk":::');

    activateSnippetsPackage();

    runs(() => {
      expect(console.warn).toHaveBeenCalled();
      if (atom.notifications != null) {
        expect(atom.notifications.addError).toHaveBeenCalled();
      }
    });
  });

  describe("packages-with-snippets-disabled feature", () => {
    it("disables no snippets if the config option is empty", () => {
      const originalConfig = atom.config.get('core.packagesWithSnippetsDisabled');
      atom.config.set('core.packagesWithSnippetsDisabled', []);

      activateSnippetsPackage();
      runs(() => {
        const snippets = snippetsService.snippetsForScopes(['.package-with-snippets-unique-scope']);
        expect(Object.keys(snippets).length).toBe(1);
        atom.config.set('core.packagesWithSnippetsDisabled', originalConfig);
      });
    });

    it("still includes a disabled package's snippets in the list of unparsed snippets", () => {
      let originalConfig = atom.config.get('core.packagesWithSnippetsDisabled');
      atom.config.set('core.packagesWithSnippetsDisabled', []);

      activateSnippetsPackage();
      runs(() => {
        atom.config.set('core.packagesWithSnippetsDisabled', ['package-with-snippets']);
        const allSnippets = snippetsService.getUnparsedSnippets();
        const scopedSnippet = allSnippets.find(s => s.selectorString === '.package-with-snippets-unique-scope');
        expect(scopedSnippet).not.toBe(undefined);
        atom.config.set('core.packagesWithSnippetsDisabled', originalConfig);
      });
    });

    it("never loads a package's snippets when that package is disabled in config", () => {
      const originalConfig = atom.config.get('core.packagesWithSnippetsDisabled');
      atom.config.set('core.packagesWithSnippetsDisabled', ['package-with-snippets']);

      activateSnippetsPackage();
      runs(() => {
        const snippets = snippetsService.snippetsForScopes(['.package-with-snippets-unique-scope']);
        expect(Object.keys(snippets).length).toBe(0);
        atom.config.set('core.packagesWithSnippetsDisabled', originalConfig);
      });
    });

    it("unloads and/or reloads snippets from a package if the config option is changed after activation", () => {
      const originalConfig = atom.config.get('core.packagesWithSnippetsDisabled');
      atom.config.set('core.packagesWithSnippetsDisabled', []);

      activateSnippetsPackage();
      runs(() => {
        let snippets = snippetsService.snippetsForScopes(['.package-with-snippets-unique-scope']);
        expect(Object.keys(snippets).length).toBe(1);

        // Disable it.
        atom.config.set('core.packagesWithSnippetsDisabled', ['package-with-snippets']);
        snippets = snippetsService.snippetsForScopes(['.package-with-snippets-unique-scope']);
        expect(Object.keys(snippets).length).toBe(0);

        // Re-enable it.
        atom.config.set('core.packagesWithSnippetsDisabled', []);
        snippets = snippetsService.snippetsForScopes(['.package-with-snippets-unique-scope']);
        expect(Object.keys(snippets).length).toBe(1);

        atom.config.set('core.packagesWithSnippetsDisabled', originalConfig);
      });
    });
  });
});
