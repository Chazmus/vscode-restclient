import * as Constants from '../../common/constants';
import { EnvironmentController } from '../../controllers/environmentController';
import { SystemSettings } from '../../models/configurationSettings';
import { ResolveErrorMessage } from '../../models/httpVariableResolveResult';
import { VariableType } from '../../models/variableType';
import { HttpVariable, HttpVariableProvider } from './httpVariableProvider';
import * as fs from 'fs-extra';

export class EnvironmentVariableProvider implements HttpVariableProvider {
    private static _instance: EnvironmentVariableProvider;

    private readonly _settings: SystemSettings = SystemSettings.Instance;

    public static get Instance(): EnvironmentVariableProvider {
        if (!this._instance) {
            this._instance = new EnvironmentVariableProvider();
        }

        return this._instance;
    }

    private constructor() {
    }

    public readonly type: VariableType = VariableType.Environment;

    public async has(name: string): Promise<boolean> {
        const variables = await this.getAvailableVariables();
        return name in variables;
    }

    public async get(name: string): Promise<HttpVariable> {
        const variables = await this.getAvailableVariables();
        if (!(name in variables)) {
            return { name, error: ResolveErrorMessage.EnvironmentVariableNotExist };
        }

        return { name, value: variables[name] };
    }

    public async getAll(): Promise<HttpVariable[]> {
        const variables = await this.getAvailableVariables();
        return Object.keys(variables).map(key => ({ name: key, value: variables[key]}));
    }

    private async getAvailableVariables(): Promise<{ [key: string]: string }> {
        let { name: environmentName } = await EnvironmentController.getCurrentEnvironment();
        if (environmentName === Constants.NoEnvironmentSelectedName) {
            environmentName = EnvironmentController.sharedEnvironmentName;
        }
        const variables = this._settings.environmentVariables;
        const currentEnvironmentVariables = variables[environmentName];
        const sharedEnvironmentVariables = variables[EnvironmentController.sharedEnvironmentName];

        // Resolve mappings from shared environment
        this.mapEnvironmentVariables('shared', sharedEnvironmentVariables, sharedEnvironmentVariables);
        this.mapEnvironmentVariables('shared', currentEnvironmentVariables, sharedEnvironmentVariables);

        // Resolve mappings from current environment
        this.mapEnvironmentVariables(environmentName, currentEnvironmentVariables, currentEnvironmentVariables);

        // Load environment variables from specified files
        const environmentVariableFiles = this._settings.environmentVariableFiles;
        if (environmentVariableFiles && environmentVariableFiles.length > 0) {
            for (const file of environmentVariableFiles) {
                const fileVariables = await this.loadEnvironmentVariablesFromFile(file);
                Object.assign(sharedEnvironmentVariables, fileVariables);
                Object.assign(currentEnvironmentVariables, fileVariables);
            }
        }

        return {...sharedEnvironmentVariables, ...currentEnvironmentVariables};
    }

    private mapEnvironmentVariables(environment: string, current: { [key: string]: string }, shared: { [key: string]: string }) {
        for (const [key, value] of Object.entries(current)) {
            const variableRegex = new RegExp(`\\{{2}\\$${environment} (.+?)\\}{2}`);
            const match = variableRegex.exec(value);

            if (!match) {
                continue;
            }

            const referenceKey = match[1].trim();

            current[key] = current[key]!.replace(
                variableRegex,
                shared[referenceKey]!);
        }
    }

    private async loadEnvironmentVariablesFromFile(filePath: string): Promise<{ [key: string]: string }> {
        try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            return JSON.parse(fileContent);
        } catch (error) {
            console.error(`Failed to load environment variables from file: ${filePath}`, error);
            return {};
        }
    }
}
