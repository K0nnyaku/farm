// import { watch } from 'chokidar';
import { FSWatcher } from 'chokidar';
// import { Server } from '../../index.js';
import { Server, Server as httpServer } from '../../server/index.js';
// import WsServer from '../../server/ws.js';
import { CompilationContext, ViteModule } from '../type.js';
import { throwIncompatibleError } from './utils.js';

// TODO type error refactor vite adaptor
export class ViteDevServerAdapter {
  moduleGraph: ViteModuleGraphAdapter;
  config: any;
  pluginName: string;
  // printUrls: any;
  resolvedUrls: any;
  serverOptions: any;
  watcher: FSWatcher;
  middlewares: any;
  ws: any;
  httpServer: httpServer;
  private _server: any;

  constructor(pluginName: string, config: any, server: any) {
    this.moduleGraph = createViteModuleGraphAdapter(pluginName);
    this.config = config;
    this.pluginName = pluginName;
    // watcher is not used in Farm vite plugin for now
    // it's only for compatibility
    // this.watcher = watch(config.root);

    this._server = server;

    this.watcher = server.watcher.getInternalWatcher();

    this.middlewares = server.middlewares;

    // this.printUrls = server.printUrls;

    this.resolvedUrls = server.resolvedUrls;

    this.serverOptions = server.serverOptions;

    this.ws = server.ws;

    this.httpServer = server.httpServer;
  }

  get printUrls() {
    return this._server.printUrls;
  }

  set printUrls(value) {
    this._server.printUrls = value;
  }
}

export class ViteModuleGraphAdapter {
  context: CompilationContext;
  pluginName: string;

  constructor(pluginName: string) {
    // context will be set in buildStart hook
    this.context = undefined;
    this.pluginName = pluginName;
  }

  getModulesByFile(file: string): ViteModule[] {
    const raw = this.context.viteGetModulesByFile(file);

    return raw.map((item) => {
      return proxyViteModuleNode(item, this.pluginName, this.context);
    });
  }

  getModuleById(id: string): ViteModule {
    const raw = this.context.viteGetModuleById(id);

    if (raw) {
      return proxyViteModuleNode(raw, this.pluginName, this.context);
    }
  }

  async getModuleByUrl(url: string): Promise<ViteModule | undefined> {
    if (url.startsWith('/')) {
      url = url.slice(1);
      const raw = this.context.viteGetModuleById(url);

      if (raw) {
        return proxyViteModuleNode(raw, this.pluginName, this.context);
      }
    }
  }

  invalidateModule() {
    /** does thing for now, only for compatibility */
  }
}

function proxyViteModuleNode(
  node: ViteModule,
  pluginName: string,
  context: CompilationContext
) {
  const proxy = new Proxy(node, {
    get(target, key) {
      if (key === 'importers') {
        return context.viteGetImporters(target.id);
      }

      const allowedKeys = ['url', 'id', 'file', 'type'];

      if (allowedKeys.includes(String(key))) {
        return target[key as keyof typeof target];
      }

      throwIncompatibleError(pluginName, 'viteModuleNode', allowedKeys, key);
    }
  });

  return proxy;
}

export function createViteDevServerAdapter(
  pluginName: string,
  config: any,
  server: any
) {
  const proxy = new Proxy(
    new ViteDevServerAdapter(pluginName, config, server),
    {
      get(target, key) {
        const objectKeys = [
          'constructor',
          'Symbol(Symbol.toStringTag)',
          'prototype'
        ];
        const allowedKeys = [
          'serverOptions',
          'resolvedUrls',
          'printUrls',
          'moduleGraph',
          'config',
          'watcher',
          'middlewares',
          'middlewareCallbacks',
          'ws',
          'httpServer'
        ];
        if (
          objectKeys.includes(String(key)) ||
          allowedKeys.includes(String(key))
        ) {
          return target[key as keyof typeof target];
        }

        throwIncompatibleError(pluginName, 'viteDevServer', allowedKeys, key);
      },
      set(target, key, value) {
        const handler =
          handleSetOperation[key as keyof typeof handleSetOperation] ||
          handleSetOperation.default;
        return handler(target, key, value, server);
      }
    }
  );

  return proxy;
}

export function createViteModuleGraphAdapter(pluginName: string) {
  const proxy = new Proxy(new ViteModuleGraphAdapter(pluginName), {
    get(target, key) {
      const allowedKeys = [
        'getModulesByFile',
        'getModuleById',
        'getModuleByUrl',
        'invalidateModule'
      ];
      const ownkeys = Reflect.ownKeys(target);

      if (allowedKeys.includes(String(key)) || ownkeys.includes(key)) {
        return target[key as keyof typeof target];
      }

      throwIncompatibleError(pluginName, 'viteModuleGraph', allowedKeys, key);
    },
    set(target, p, newValue, _receiver) {
      if (p === 'context') {
        target.context = newValue;
        return true;
      }

      throwIncompatibleError(pluginName, 'viteModuleGraph', ['context'], p);
    }
  });

  return proxy;
}

type SetOperationHandler<T> = (
  target: T,
  key: string | symbol,
  value: any,
  server: Server
) => boolean;

type HandleSetOperationType<T> = {
  [K in keyof T]?: SetOperationHandler<T>;
} & {
  default: SetOperationHandler<T>;
};

export const handleSetOperation: HandleSetOperationType<ViteDevServerAdapter> =
  {
    printUrls: (target, _key, value, server) => {
      // target.printUrls = function() {
      //   value.call(server);
      // };
      if (_key === 'printUrls') {
        server[_key] = value.bind(server);
      } else {
        (target as any)[_key] = value;
      }
      return true;
    },
    default: (target, key, value) => {
      (target as any)[key] = value;
      return true;
    }
  };
