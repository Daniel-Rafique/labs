declare module 'node-machine-id' {
  export function machineId(): Promise<string>;
  export function machineIdSync(original?: boolean): string;
}
