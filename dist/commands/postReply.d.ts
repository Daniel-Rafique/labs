interface PostReplyOptions {
    path?: string;
    directory?: string;
    tokenMint?: string;
    comment?: string;
    useAi?: boolean;
    randomize?: boolean;
    useProxy?: boolean;
    shillMode?: boolean;
    preferredMethod?: 'browser';
    likeMode?: boolean;
    likeCount?: number;
    withImage?: boolean;
}
export declare function postReplyCommand(options: PostReplyOptions): Promise<void>;
export {};
