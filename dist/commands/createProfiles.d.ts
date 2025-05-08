interface CreateProfilesOptions {
    path?: string;
    directory?: string;
    username?: string;
    bio?: string;
    withImage?: boolean;
    useAi?: boolean;
    useProxy?: boolean;
}
export declare function createProfilesCommand(options: CreateProfilesOptions): Promise<void>;
export {};
