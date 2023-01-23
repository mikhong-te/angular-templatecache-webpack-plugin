/* eslint-disable no-useless-escape */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
/* eslint-disable prettier/prettier */
/* eslint-disable linebreak-style */
const fs = require('fs');
const glob = require('glob');
const path = require('path');
const jsesc = require('jsesc');
const globParent = require('glob-parent');
const { validate } = require('schema-utils');
const webpack = require('webpack');
const lodashTemplate = require('lodash.template');
const htmlMinifier = require('html-minifier');

const schema = {
    type: 'object',
    properties: {
        source: {
            anyOf: [
                {
                    type: 'string',
                    minLength: 1,
                },
                {
                    type: 'array',
                    minItems: 1,
                },
            ],
        },
        root: {
            type: 'string',
            minLength: 1,
        },
        destination: {
            anyOf: [
                {
                    type: 'string',
                    minLength: 1,
                },
                {
                    type: 'array',
                    minItems: 1,
                },
            ],
        },
        outputFilename: {
            anyOf: [
                {
                    type: 'string',
                    minLength: 1,
                },
                {
                    type: 'array',
                    minItems: 1,
                },
            ],
        },
        module: {
            type: 'string',
        },
        modules: {
            type: 'array',
            minItems: 1,
            properties: {
                moduleName: {
                    type: 'string',
                },
                outputFilename: {
                    type: 'string'
                },
                source: {
                    anyOf: [
                        {
                            type: 'string',
                            minLength: 1,
                        },
                        {
                            type: 'array',
                            minItems: 1,
                        },
                    ]
                }
            }
        },
        templateHeader: {
            type: 'string',
        },
        templateBody: {
            type: 'string',
        },
        templateFooter: {
            type: 'string',
        },
        escapeOptions: {
            type: 'object',
        },
        standalone: {
            type: 'boolean',
        },
        isProd: {
            type: 'boolean', // todo: should uglify
        }
    },
    additionalProperties: false,
};

class AngularTemplateCacheWebpackPlugin {
    constructor(options) {
        validate(schema, options, { name: 'AngularTemplateCacheWebpackPlugin' });

        // todo: if hardcoding templates, make sure backslashes are escaped

        const TEMPLATE_HEADER =
            "angular.module('<%= module %>'<%= standalone %>).run(['$templateCache', function($templateCache) {";
        // const TEMPLATE_HEADER =
        //     'angular.module("app.templates", []).run(["$templateCache", function($templateCache) {$templateCache.put("/app/embed/embed.html","<div class=embed-widget-layout ng-class=\\"{loading: widgetStatus.isDataLoading}\\"> <te-widget-status-vue ng-if=\\"!widgetStatus.getShouldWidgetBeShown() || widgetStatus.isDataLoading\\" v-props-widget=widget v-props-widget-status=widgetStatus> </te-widget-status-vue> <div ng-if=\\"widgetStatus.getShouldWidgetBeShown() && hasData\\" class=\\"clearfix widget-screenshot-container\\"> <te-widget-manager-vue ng-if=selectors.getHaveWidgetsLoaded()></te-widget-manager-vue> </div> </div>");';
        // const TEMPLATE_HEADER_ICONS = 'angular.module("te-embed-icons", []).run(["$templateCache", function($templateCache) {$templateCache.put("/static/svg/embed-icons/device-group-badge.svg","<svg width=\"27\" height=\"16\" viewBox=\"0 0 27 12\" xmlns=\"http://www.w3.org/2000/svg\"><rect fill=\"#69C\" x=\"3\" y=\".6\" width=\"18\" height=\"12\" rx=\"6\" transform=\"translate(-2)\" fill-rule=\"evenodd\"/></svg>");';
        //     "$templateCache.put('/app/embed/embed.html','<div class=embed-widget-layout ng-class='{loading: widgetStatus.isDataLoading}'> <te-widget-status-vue ng-if='!widgetStatus.getShouldWidgetBeShown() || widgetStatus.isDataLoading' v-props-widget=widget v-props-widget-status=widgetStatus> </te-widget-status-vue> <div ng-if='widgetStatus.getShouldWidgetBeShown() && hasData' class='clearfix widget-screenshot-container'> <te-widget-manager-vue ng-if=selectors.getHaveWidgetsLoaded()></te-widget-manager-vue> </div> </div>');";
        const TEMPLATE_BODY = '$templateCache.put("<%= url %>","<%= contents %>");';

        const TEMPLATE_FOOTER = '}]);';
        const DEFAULT_FILENAME = 'templates.js';
        const DEFAULT_MODULE = 'templates';

        const userOptions = options || {};

        const defaultOptions = {
            source: userOptions.source === undefined ? '' : userOptions.source,
            root: userOptions.root === undefined ? '' : userOptions.root,
            outputFilename: userOptions.outputFilename === undefined ? DEFAULT_FILENAME : userOptions.outputFilename,
            module: userOptions.module === undefined ? DEFAULT_MODULE : userOptions.module,
            modules: userOptions.module === undefined ? DEFAULT_MODULE : userOptions.modules,
            templateHeader: userOptions.templateHeader === undefined ? TEMPLATE_HEADER : userOptions.templateHeader,
            templateBody: userOptions.templateBody === undefined ? TEMPLATE_BODY : userOptions.templateBody,
            templateFooter: userOptions.templateFooter === undefined ? TEMPLATE_FOOTER : userOptions.templateFooter,
            escapeOptions: userOptions.escapeOptions === undefined ? {} : userOptions.escapeOptions,
            standalone: !!userOptions.standalone,
        };

        this.options = Object.assign(defaultOptions, userOptions);

        this.init();
    }

    apply(compiler) {
        console.log('apply')
        const outputNormal = {};

        compiler.hooks.thisCompilation.tap('AngularTemplateCacheWebpackPlugin', compilation => {
            // TODO: loop through modules first, and then nest forEach in there
            this.modules.forEach( module => {
                // console.log(module);
                this.files.forEach(f => compilation.fileDependencies.add(path.join(compiler.context, f)));
                compilation.hooks.additionalAssets.tapAsync('AngularTemplateCacheWebpackPlugin', cb => {
                    this.processTemplates();

                    // console.log(this.files);
                    const dest = compiler.options.output.path;

                    const outputPaths = [];
                    this.options.outputFilename.forEach((folder) => outputPaths.push(path.resolve(dest, folder)));
                    // const outputPath = path.resolve(dest, this.options.outputFilename);
                    let cachedTemplates = '';

                    this.templatelist.forEach(template => {
                        cachedTemplates += template + '\n';
                    });

                    outputNormal[outputPaths[0]] = {
                        filename: outputPaths[0],
                        content: cachedTemplates,
                        size: cachedTemplates.length,
                    };

                    outputNormal[outputPaths[1]] = {
                        filename: outputPaths[1],
                        content: cachedTemplates,
                        size: cachedTemplates.length,
                    };


                    for (const [key, value] of Object.entries(outputNormal)) {
                        compilation.emitAsset(value.filename, new webpack.sources.RawSource(value.content));
                    }
                    cb();
                });
            });
            });
        }

    init() {
        // this.files = typeof this.options.source === 'string' ? glob.sync(this.options.source) : this.options.source;
        this.files = {};
        this.modules = this.options.modules;
        this.modules.forEach(module => {
            const moduleSourceFiles = typeof module.source === 'string' ? glob.sync(module.source) : module.source;
            this.files[module.moduleName] = [];
            if (Array.isArray(moduleSourceFiles)) {
                moduleSourceFiles.forEach((pattern) => this.files[module.moduleName].push(...glob.sync(pattern)));
            } else {
                this.files[module.moduleName].push(module.source);
            }
        });
        // const globbedFiles = [];
        // this.files.forEach((pattern) => globbedFiles.push(...glob.sync(pattern)));
        // this.files = globbedFiles;

        this.templateBody = this.options.templateBody;
        this.templateHeader = this.options.templateHeader;
        this.templateFooter = this.options.templateFooter;
    }

    processTemplates() {
        this.templatelist = [];
        this.processHeader();
        this.processBody();
        this.processFooter();
    }

    processHeader() {
        let header = lodashTemplate(this.templateHeader)({
            module: this.options.module,
            standalone: this.options.standalone ? ', []' : '',
        });
        this.templatelist.unshift(header);
    }

    processBody() {
        this.files.forEach(file => {
            let tpl = {};
            tpl.source = fs.readFileSync(file);
            // tpl.source = htmlmin(tpl.source);
            tpl.source = htmlMinifier.minify(
                tpl.source.toString(),
                {
                collapseBooleanAttributes: true,
                collapseInlineTagWhitespace: false,
                collapseWhitespace: true,
                conservativeCollapse: false,
                includeAutoGeneratedTags: false,
                keepClosingSlash: false,
                preventAttributesEscaping: false,
                processConditionalComments: true,
                removeAttributeQuotes: true,
                removeComments: true,
                removeEmptyAttributes: true,
                removeEmptyElements: false,
                removeOptionalTags: true,
                removeRedundantAttributes: true,
                removeScriptTypeAttributes: true,
                removeStyleLinkTypeAttributes: true,
                removeTagWhitespace: true,
                sortAttributes: true,
                sortClassName: true,
                trimCustomFragments: true,
                useShortDoctype: true,
                },
            );

            let htmlRootDir = globParent(this.options.source);
            let filename = path.posix.relative(htmlRootDir, file);
            let url = path.posix.join(this.options.root, filename);
            url = url.replace('../webapp/', '');

            if (this.options.root === '.' || this.options.root.indexOf('./') === 0) {
                url = './' + url;
            }
            url = '/' + url;
            tpl.source = lodashTemplate(this.templateBody)({
                url: url,
                contents: jsesc(tpl.source.toString('utf8'), this.options.escapeOptions),
                file: file,
            });

            // tpl.source = tpl.source.replace('\n', '');
            this.templatelist.push(tpl.source);
        });
    }

    processFooter() {
        this.templatelist.push(this.templateFooter);
    }
}

module.exports = AngularTemplateCacheWebpackPlugin;
