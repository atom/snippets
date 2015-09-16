# Snippets package [![Build Status](https://travis-ci.org/atom/snippets.svg?branch=master)](https://travis-ci.org/atom/snippets)

Expand snippets matching the current prefix with `tab` in Atom.

To add your own snippets, select the _Atom > Open Your Snippets_ menu option if you're using OSX or the _Edit > Open Your Snippets_ menu option if you're using Windows or Linux.

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

The outermost keys are the selectors where this snippets should be active (details below).

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

### Finding out the correct selector (scope) for a snippet

The outmost key of a snippet is the "scope" that you want the descendent snippets
to be available in.

You can find out the correct scope by opening the Settings (<kbd>Cmd+,</kbd> on OS X)
and selecting the corresponding *Language [xxx]* plugin, e.g. for *Language Html*:

![Screenshot of Language Html settings](https://cloud.githubusercontent.com/assets/1038121/5137632/126beb66-70f2-11e4-839b-bc7e84103f67.png)

If it's difficult to determine the plugin handling the file type in question
(for example, for `.md`-documents), you can also proceed as following:

1. Open a file of the type for which you want to add a snippet
2. Open the Developer Tools (<kbd>Cmd+Alt+I</kbd> on OS X)
3. Switch to the Console tab
4. Focus the source file and execute the _Editor > Log Cursor Scope_ command (<kbd>Cmd+Alt+P</kbd> on OS X)

The first entry in the array that is logged to the Console is the scope for that language.

If you have special characters (like `+`) in the scope, you have to escape them:

```coffee
.source.c, .source.c\\+\\+, .source.objc, .source.objc\\+\\+':
  ...
```

### Multiple snippets for the same scope

Since the `snippets.cson` file describes one single object, snippets for the same selector must be placed within the same key, so that would work:

```coffee
'.source.gfm': # The selector for "markdown" (.md) files
  'Preformatted text':
    'prefix': 'pre'
    'body': '`$1`'

  'Strikethrough':
    'prefix': 'strike'
    'body': '~~$1~~'
```

While this apperently not:

```coffee
'.source.gfm': # This one is used
  'Preformatted text':
    'prefix': 'pre'
    'body': '`$1`'

'.source.gfm': # Second declaration of the same key, ignored
  'Strikethrough':
    'prefix': 'strike'
    'body': '~~$1~~'
```
