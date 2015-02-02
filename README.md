# Snippets package [![Build Status](https://travis-ci.org/atom/snippets.svg?branch=master)](https://travis-ci.org/atom/snippets)

Expand snippets matching the current prefix with `tab` in Atom.

Select the _Atom > Open Your Snippets_ menu to add your own snippets.

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

The outermost keys are the selectors where this snippets should be active. If you would want the snippet to be active in python, for example, you would use `'.source.python'`.

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
