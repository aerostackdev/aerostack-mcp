
const noop = () => {};
const emptyObj = { prototype: {} };
const handler = {
	get: (target, prop) => {
		if (prop === 'prototype') return emptyObj;
		if (prop === 'on' || prop === 'once' || prop === 'emit') return noop;
		if (Reflect.has(target, prop)) return target[prop];
		return proxy;
	},
	construct: () => proxy,
	apply: () => proxy
};
const proxy = new Proxy(noop, handler);

export const isatty = () => false;
export const createServer = () => ({ listen: () => ({ on: () => {} }), on: () => {} });
export const readFileSync = () => { throw new Error("fs.readFileSync is not supported in Workers.") };
export const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
export const STATUS_CODES = { 200: "OK", 404: "Not Found", 500: "Internal Server Error" };
export const IncomingMessage = proxy;
export const ServerResponse = proxy;
export const Server = proxy;
export const Agent = proxy;
export const Socket = proxy;
export const networkInterfaces = () => ({});
export const arch = () => "arm64";
export const platform = () => "linux";

export default proxy;
