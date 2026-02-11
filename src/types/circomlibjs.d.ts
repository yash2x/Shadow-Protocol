declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<{
    F: {
      toObject: (val: any) => bigint;
    };
    (inputs: bigint[]): any;
  }>;
}
