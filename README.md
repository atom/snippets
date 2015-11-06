# Snippets package [![Build Status](https://travis-ci.org/atom/snippets.svg?branch=master)](https://travis-ci.org/atom/snippets)

Expand snippets matching the current prefix with `tab` in Atom.

To add your own snippets, select the _Atom > Open Your Snippets_ menu option if you're using OSX, or the _File > Open Your Snippets_ menu option if you're using Windows, use _Edit > Open Your Snippets if you are using Linux.

## Snippet Format

Snippets files are stored in a package's `snippets/` folder and also loaded
from `~/.atom/snippets.cson`.

Snippet files can be either `.json` or `.cson`.

```coffee
'.source.js':
  'console.log':
    'prefix': 'log'
    'body': 'console.log(${1:"crash"});$2'
```

The outermost keys are the selectors where these snippets should be active, prefixed with a period (`.`) (details below).

The next level of keys are the snippet names.

Under each snippet name is a `prefix` that should trigger the snippet and a
`body` to insert when the snippet is triggered.

`$` followed by a number are the tabs stops which can be cycled between by
pressing `tab` once a snippet has been triggered.

The above example adds a `log` snippet to JavaScript files that would expand
to.

```js
console.log("crash");
```

The string `"crash"` would be initially selected and pressing tab again would
place the cursor after the `;`

### Determining the correct scope for a snippet

The outmost key of a snippet is the "scope" that you want the descendent snippets
to be available in. The key should be prefixed with a period (`text.html.basic` => `.text.html.basic`). You can find out the correct scope by opening the Settings (<kbd>cmd+,</kbd> on OS X)
and selecting the corresponding *Language [xxx]* package, e.g. for *Language Html*:

![Screenshot of Language Html settings](https://cloud.githubusercontent.com/assets/1038121/5137632/126beb66-70f2-11e4-839b-bc7e84103f67.png)

If it's difficult to determine the package handling the file type in question
(for example, for `.md`-documents), you can also proceed as following. Put your
cursor in a file in which you want the snippet to be available, open the
[Command Palette](https://github.com/atom/command-palette)
(<kbd>cmd+shift+p</kbd>), and run the `Editor: Log Cursor Scope` command. This
will trigger a notification which will contain a list of scopes. The first
scope that's listed is the scope for that language. Here are some examples:
`source.coffee`, `text.plain`, `text.html.basic`.

### Multi-line Snippet Body

You can also use multi-line syntax using `"""` for larger templates:

```coffee
'.source.js':
  'if, else if, else':
    'prefix': 'ieie'
    'body': """
      if (${1:true}) {
        $2
      } else if (${3:false}) {
        $4
      } else {
        $5
      }
    """
```

### Escaping Characters

Including a literal closing brace inside the text provided by a snippet's tab stop will close
that tab stop early. To prevent that, escape the brace with two backslashes, like so:

```coffee
'.source.js':
  'function':
    'prefix': 'funct'
    'body': """
      ${1:function () {
        statements;
      \\}
      this line is also included in the snippet tab;
      }
      """
```

### Multiple snippets for the same scope

Snippets for the same scope must be placed within the same key. See [this section of the Atom Flight Manual](https://atom.io/docs/latest/using-atom-basic-customization#configuring-with-cson) for more information.
