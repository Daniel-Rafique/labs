export interface ConfigValidationResult {
    isValid: boolean;
    missingItems: string[];
    message: string;
}
/**
 * Validates that all required configuration is present
 */
export declare function validateRequiredConfig(): ConfigValidationResult;
/**
 * Display a warning if any optional configuration is missing
 */
export declare function checkOptionalConfig(): void;
/**
 * Shows missing configuration error with instructions
 */
export declare function showConfigurationError(validationResult: ConfigValidationResult): void;
