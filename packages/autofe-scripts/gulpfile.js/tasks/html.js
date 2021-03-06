'use strict';

const { src, dest } = require('gulp');
const config = require('../config');
const render = require('gulp-nunjucks-render');
const data = require('gulp-data');
const path = require('path');
const PluginError = require('plugin-error');

const isProd = process.env.NODE_ENV === 'production';

const manageEnvironment = function (env) {
  // IncludePrettyExtension
  function IncludePrettyExtension() {
    const tagName = 'includePretty';
    this.tags = [tagName];
    this.parse = function (parse, nodes) {
      const tag = parse.peekToken();
      if (!parse.skipSymbol(tagName)) {
        parse.fail(`parseTemplateRef: expected ${tagName}`);
      }

      let indent = 0;
      const colno = tag.colno;
      // 回到行首
      parse.tokens.backN(colno + tagName.length);
      // 找到该行第一个字符的索引
      try {
        let str = parse.tokens.currentStr();
        for (; indent < colno; indent++) {
          if (str.charAt(indent) !== ' ') {
            break;
          }
        }
      } catch (e) {
        // 假定开头内容为 {% includePretty
        indent = colno - 3;
      }
      // 回到原位置
      parse.tokens.forwardN(colno + tagName.length);

      const args = parse.parseSignature(null, true);

      // var node = new nodes.Include(tag.lineno, tag.colno);
      // node.template = parse.parseExpression();

      parse.advanceAfterBlockEnd(tag.value);

      const indentValue = new nodes.Output(0, 0, [new nodes.TemplateData(0, 0, indent)]);

      const node = new nodes.CallExtension(this, 'run', args, [indentValue]);

      return node;
    };
    this.run = function (context, url, indentValue) {
      let output = '';
      const indentWidth = indentValue();
      const indentFilter = env.getFilter('indent');
      const trimFilter = env.getFilter('trim');
      const safeFilter = env.getFilter('safe');

      try {
        const tmpl = env.getTemplate(url);
        let result = tmpl.render(context.getVariables());
        if (indentWidth > 0) {
          result = indentFilter(result, indentWidth);
        }
        result = trimFilter(result);
        output = result;
      } catch (e) {
        throw e;
      }

      return safeFilter(output);
    };
  }
  env.addExtension('IncludePrettyExtension', new IncludePrettyExtension());

  // Filter: assets
  env.addFilter('assets', function (assetpath) {
    const url = path.join(this.ctx.__ctx_file.prefix || '', assetpath);
    return url;
  });
};

const options = {
  path: [config.src],
  manageEnv: manageEnvironment,
};

function html() {
  return src([config.html.src, config.html.exclude])
    .pipe(data((file) => {
      const obj = {
        path: file.path,
        relative: file.relative,
        base: file.base,
        prefix: path.relative(path.resolve(file.path, '..'), file.base),
      };
      return {
        __ctx_file: obj,
      };
    }))
    .pipe(render(options))
    .on('error', function (error) {
      const message = new PluginError('nunjucks', error).toString();
      process.stderr.write(`${message}\n`);

      if (isProd) {
        process.exit(1);
      } else {
        this.emit('end');
      }
    })
    .pipe(dest(config.html.dest))
}

exports.html = html;
