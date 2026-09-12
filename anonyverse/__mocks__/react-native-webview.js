const React = require('react');

const WebView = React.forwardRef((props, ref) => React.createElement('WebView', { ...props, ref }));

module.exports = { WebView };
