import { EventEmitter, QuickPickItem, window, workspace } from 'vscode';
import * as path from 'path';
import * as Constants from '../common/constants';
import { SystemSettings } from '../models/configurationSettings';
import { trace } from "../utils/decorator";
import { EnvironmentStatusEntry } from '../utils/environmentStatusBarEntry';
import { UserDataManager } from '../utils/userDataManager';
import * as fs from 'fs-extra';

type EnvironmentPickItem = QuickPickItem & { name: string };

export class EnvironmentController {
    private static readonly noEnvironmentPickItem: EnvironmentPickItem = {
        label: 'No Environment',
        name: Constants.NoEnvironmentSelectedName,
        description: 'You can still use variables defined in the $shared environment'
    };

    public static readonly sharedEnvironmentName: string = '$shared';

    private static readonly _onDidChangeEnvironment = new EventEmitter<string>();

    public static readonly onDidChangeEnvironment = EnvironmentController._onDidChangeEnvironment.event;

    private readonly settings: SystemSettings = SystemSettings.Instance;

    private environmentStatusEntry: EnvironmentStatusEntry;

    private currentEnvironment: EnvironmentPickItem;

    private constructor(initEnvironment: EnvironmentPickItem) {
        this.currentEnvironment = initEnvironment;
        this.environmentStatusEntry = new EnvironmentStatusEntry(initEnvironment.label);
    }

    @trace('Switch Environment')
    public async switchEnvironment() {

        // Load environment variables from file if specified
        const environmentVariableFiles = this.settings.environmentVariableFiles;
        let envVars = {};
        if (environmentVariableFiles && environmentVariableFiles.length > 0) {
            for (const file of environmentVariableFiles) {
                const variables = await this.loadEnvironmentVariablesFromFile(file);
                envVars = this.mergeObjects(envVars, variables);
            }
        }

        envVars = this.mergeObjects(envVars, this.settings.environmentVariables);
        // Add no environment at the top
        const userEnvironments: EnvironmentPickItem[] =
            Object.keys(envVars)
                .filter(name => name !== EnvironmentController.sharedEnvironmentName)
                .map(name => ({
                    name,
                    label: name,
                    description: name === this.currentEnvironment.name ? '$(check)' : undefined
                }));

        const itemPickList: EnvironmentPickItem[] = [EnvironmentController.noEnvironmentPickItem, ...userEnvironments];
        const item = await window.showQuickPick(itemPickList, { placeHolder: "Select REST Client Environment" });
        if (!item) {
            return;
        }

        this.currentEnvironment = item;

        EnvironmentController._onDidChangeEnvironment.fire(item.label);
        this.environmentStatusEntry.update(item.label);

        await UserDataManager.setEnvironment(item);

    }

    private async loadEnvironmentVariablesFromFile(filePath: string) {
        try {
            const absolutePath = path.join(workspace.workspaceFolders![0].uri.fsPath, filePath);
            const fileContent = await fs.readFile(absolutePath, 'utf8');
            const variables = JSON.parse(fileContent);
            return variables
        } catch (error) {
            console.error(`Failed to load environment variables from file: ${filePath}`, error);
        }
    }

    public static async create(): Promise<EnvironmentController> {
        const environment = await this.getCurrentEnvironment();
        return new EnvironmentController(environment);
    }

    public static async getCurrentEnvironment(): Promise<EnvironmentPickItem> {
        const currentEnvironment = await UserDataManager.getEnvironment() as EnvironmentPickItem | undefined;
        return currentEnvironment || this.noEnvironmentPickItem;
    }

    public dispose() {
        this.environmentStatusEntry.dispose();
    }

    private mergeObjects(obj1, obj2) {
    const merged = { ...obj1 };
    for (let key in obj2) {
        if (obj2.hasOwnProperty(key)) {
            if (typeof obj1[key] === 'object' && typeof obj2[key] === 'object' 
                && obj1[key] !== null && obj2[key] !== null) {
                merged[key] = this.mergeObjects(obj1[key], obj2[key]);
            } else {
                merged[key] = obj2[key];
            }
        }
    }

    return merged;
}

}
