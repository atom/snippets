/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require('path');
const fs = require('fs-plus');
const temp = require('temp').track();

describe("Snippet Loading", function() {
  let [configDirPath, snippetsService] = Array.from([]);

  beforeEach(function() {
    configDirPath = temp.mkdirSync('atom-config-dir-');
    spyOn(atom, 'getConfigDirPath').andReturn(configDirPath);

    spyOn(console, 'warn');
    if (atom.notifications != null) { spyOn(atom.notifications, 'addError'); }

    return spyOn(atom.packages, 'getLoadedPackages').andReturn([
      atom.packages.loadPackage(path.join(__dirname, 'fixtures', 'package-with-snippets')),
      atom.packages.loadPackage(path.join(__dirname, 'fixtures', 'package-with-broken-snippets')),
    ]);});

  afterEach(function() {
    waitsForPromise(() => Promise.resolve(atom.packages.deactivatePackages('snippets')));
    return runs(() => jasmine.unspy(atom.packages, 'getLoadedPackages'));
  });

  const activateSnippetsPackage = function() {
    waitsForPromise(() => atom.packages.activatePackage("snippets").then(function({mainModule}) {
      snippetsService = mainModule.provideSnippets();
      return mainModule.loaded = false;
    }));

    return waitsFor("all snippets to load", 3000, () => snippetsService.bundledSnippetsLoaded());
  };

  it("loads the bundled snippet template snippets", function() {
    activateSnippetsPackage();

    return runs(function() {
      const jsonSnippet = snippetsService.snippetsForScopes(['.source.json'])['snip'];
      expect(jsonSnippet.name).toBe('Atom Snippet');
      expect(jsonSnippet.prefix).toBe('snip');
      expect(jsonSnippet.body).toContain('"prefix":');
      expect(jsonSnippet.body).toContain('"body":');
      expect(jsonSnippet.tabStopList.length).toBeGreaterThan(0);

      const csonSnippet = snippetsService.snippetsForScopes(['.source.coffee'])['snip'];
      expect(csonSnippet.name).toBe('Atom Snippet');
      expect(csonSnippet.prefix).toBe('snip');
      expect(csonSnippet.body).toContain("'prefix':");
      expect(csonSnippet.body).toContain("'body':");
      return expect(csonSnippet.tabStopList.length).toBeGreaterThan(0);
    });
  });

  it("loads non-hidden snippet files from atom packages with snippets directories", function() {
    activateSnippetsPackage();

    return runs(function() {
      let snippet = snippetsService.snippetsForScopes(['.test'])['test'];
      expect(snippet.prefix).toBe('test');
      expect(snippet.body).toBe('testing 123');

      snippet = snippetsService.snippetsForScopes(['.test'])['testd'];
      expect(snippet.prefix).toBe('testd');
      expect(snippet.body).toBe('testing 456');
      expect(snippet.description).toBe('a description');
      expect(snippet.descriptionMoreURL).toBe('http://google.com');

      snippet = snippetsService.snippetsForScopes(['.test'])['testlabelleft'];
      expect(snippet.prefix).toBe('testlabelleft');
      expect(snippet.body).toBe('testing 456');
      expect(snippet.leftLabel).toBe('a label');

      snippet = snippetsService.snippetsForScopes(['.test'])['testhtmllabels'];
      expect(snippet.prefix).toBe('testhtmllabels');
      expect(snippet.body).toBe('testing 456');
      expect(snippet.leftLabelHTML).toBe('<span style=\"color:red\">Label</span>');
      return expect(snippet.rightLabelHTML).toBe('<span style=\"color:white\">Label</span>');
    });
  });

  it("logs a warning if package snippets files cannot be parsed", function() {
    activateSnippetsPackage();

    return runs(function() {
      // Warn about invalid-file, but don't even try to parse a hidden file
      expect(console.warn.calls.length).toBeGreaterThan(0);
      return expect(console.warn.mostRecentCall.args[0]).toMatch(/Error reading.*package-with-broken-snippets/);
    });
  });

  describe("::loadPackageSnippets(callback)", function() {
    beforeEach(() => // simulate a list of packages where the javascript core package is returned at the end
    atom.packages.getLoadedPackages.andReturn([
      atom.packages.loadPackage(path.join(__dirname, 'fixtures', 'package-with-snippets')),
      atom.packages.loadPackage('language-javascript')
    ]));

    return it("allows other packages to override core packages' snippets", function() {
      waitsForPromise(() => atom.packages.activatePackage("language-javascript"));

      activateSnippetsPackage();

      return runs(function() {
        const snippet = snippetsService.snippetsForScopes(['.source.js'])['log'];
        return expect(snippet.body).toBe("from-a-community-package");
      });
    });
  });

  describe("::onDidLoadSnippets(callback)", () => it("invokes listeners when all snippets are loaded", function() {
    let loadedCallback = null;

    waitsFor("package to activate", done => atom.packages.activatePackage("snippets").then(function({mainModule}) {
      mainModule.onDidLoadSnippets(loadedCallback = jasmine.createSpy('onDidLoadSnippets callback'));
      return done();
    }));

    return waitsFor("onDidLoad callback to be called", () => loadedCallback.callCount > 0);
  }));

  describe("when ~/.atom/snippets.json exists", function() {
    beforeEach(function() {
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
      return activateSnippetsPackage();
    });

    it("loads the snippets from that file", function() {
      let snippet = null;

      waitsFor(() => snippet = snippetsService.snippetsForScopes(['.foo'])['foo']);

      return runs(function() {
        expect(snippet.name).toBe('foo snippet');
        expect(snippet.prefix).toBe("foo");
        return expect(snippet.body).toBe("bar1");
      });
    });

    return describe("when that file changes", () => it("reloads the snippets", function() {
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

      waitsFor("snippets to be changed", function() {
        const snippet = snippetsService.snippetsForScopes(['.foo'])['foo'];
        return (snippet != null ? snippet.body : undefined) === 'bar2';
      });

      runs(() => fs.writeFileSync(path.join(configDirPath, 'snippets.json'), ""));

      return waitsFor("snippets to be removed", () => !snippetsService.snippetsForScopes(['.foo'])['foo']);
  }));
});

  describe("when ~/.atom/snippets.cson exists", function() {
    beforeEach(function() {
      fs.writeFileSync(path.join(configDirPath, 'snippets.cson'), `\
".foo":
  "foo snippet":
    "prefix": "foo"
    "body": "bar1"\
`
      );
      return activateSnippetsPackage();
    });

    it("loads the snippets from that file", function() {
      let snippet = null;

      waitsFor(() => snippet = snippetsService.snippetsForScopes(['.foo'])['foo']);

      return runs(function() {
        expect(snippet.name).toBe('foo snippet');
        expect(snippet.prefix).toBe("foo");
        return expect(snippet.body).toBe("bar1");
      });
    });

    return describe("when that file changes", () => it("reloads the snippets", function() {
      fs.writeFileSync(path.join(configDirPath, 'snippets.cson'), `\
".foo":
"foo snippet":
  "prefix": "foo"
  "body": "bar2"\
`
      );

      waitsFor("snippets to be changed", function() {
        const snippet = snippetsService.snippetsForScopes(['.foo'])['foo'];
        return (snippet != null ? snippet.body : undefined) === 'bar2';
      });

      runs(() => fs.writeFileSync(path.join(configDirPath, 'snippets.cson'), ""));

      return waitsFor("snippets to be removed", function() {
        const snippet = snippetsService.snippetsForScopes(['.foo'])['foo'];
        return (snippet == null);
      });
    }));
  });

  it("notifies the user when the user snippets file cannot be loaded", function() {
    fs.writeFileSync(path.join(configDirPath, 'snippets.cson'), `\
".junk":::\
`
    );

    activateSnippetsPackage();

    return runs(function() {
      expect(console.warn).toHaveBeenCalled();
      if (atom.notifications != null) { return expect(atom.notifications.addError).toHaveBeenCalled(); }
    });
  });

  return describe("packages-with-snippets-disabled feature", function() {
    it("disables no snippets if the config option is empty", function() {
      const originalConfig = atom.config.get('core.packagesWithSnippetsDisabled');
      atom.config.set('core.packagesWithSnippetsDisabled', []);

      activateSnippetsPackage();
      return runs(function() {
        const snippets = snippetsService.snippetsForScopes(['.package-with-snippets-unique-scope']);
        expect(Object.keys(snippets).length).toBe(1);
        return atom.config.set('core.packagesWithSnippetsDisabled', originalConfig);
      });
    });

    it("still includes a disabled package's snippets in the list of unparsed snippets", function() {
      let originalConfig = atom.config.get('core.packagesWithSnippetsDisabled');
      atom.config.set('core.packagesWithSnippetsDisabled', []);

      activateSnippetsPackage();
      return runs(function() {
        atom.config.set('core.packagesWithSnippetsDisabled', ['package-with-snippets']);
        const allSnippets = snippetsService.getUnparsedSnippets();
        const scopedSnippet = allSnippets.find(s => s.selectorString === '.package-with-snippets-unique-scope');
        expect(scopedSnippet).not.toBe(undefined);
        return originalConfig = atom.config.get('core.packagesWithSnippetsDisabled');
      });
    });

    it("never loads a package's snippets when that package is disabled in config", function() {
      const originalConfig = atom.config.get('core.packagesWithSnippetsDisabled');
      atom.config.set('core.packagesWithSnippetsDisabled', ['package-with-snippets']);

      activateSnippetsPackage();
      return runs(function() {
        const snippets = snippetsService.snippetsForScopes(['.package-with-snippets-unique-scope']);
        expect(Object.keys(snippets).length).toBe(0);
        return atom.config.set('core.packagesWithSnippetsDisabled', originalConfig);
      });
    });

    return it("unloads and/or reloads snippets from a package if the config option is changed after activation", function() {
      const originalConfig = atom.config.get('core.packagesWithSnippetsDisabled');
      atom.config.set('core.packagesWithSnippetsDisabled', []);

      activateSnippetsPackage();
      return runs(function() {
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

        return atom.config.set('core.packagesWithSnippetsDisabled', originalConfig);
      });
    });
  });
});
