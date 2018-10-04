import {
    AutoCodeInspection,
    Autofix,
    Build,
    CodeTransform,
    GitHubRepoRef,
    goalContributors,
    goals,
    onAnyPush,
    PushImpact,
    SoftwareDeliveryMachine,
    SoftwareDeliveryMachineConfiguration,
    whenPushSatisfies,
} from "@atomist/sdm";
import { createSoftwareDeliveryMachine, summarizeGoalsInGitHubStatus, } from "@atomist/sdm-core";
import { codeMetrics } from "@atomist/sdm-pack-sloc";
import {
    HasSpringBootApplicationClass,
    HasSpringBootPom,
    IsMaven,
    ListBranchDeploys,
    MavenBuilder,
    MavenPerBranchDeployment,
    ReplaceReadmeTitle,
    SetAtomistTeamInApplicationYml,
    SpringProjectCreationParameterDefinitions,
    SpringProjectCreationParameters,
    springSupport,
    TransformSeedToCustomProject,
} from "@atomist/sdm-pack-spring";

export function machine(
    configuration: SoftwareDeliveryMachineConfiguration,
): SoftwareDeliveryMachine {

    const sdm: SoftwareDeliveryMachine = createSoftwareDeliveryMachine(
        {
            name: "Zeus software delivery machine",
            configuration,
        });

    const autofix = new Autofix();
    const inspect = new AutoCodeInspection();
    const pushImpact = new PushImpact();

    const checkGoals = goals("checks")
        .plan(inspect)
        .plan(pushImpact)
        .plan(autofix);

    const buildGoals = goals("build")
        .plan(new Build().with({ name: "Maven", builder: new MavenBuilder(sdm) }))
        .after(autofix);

    const deployGoals = goals("deploy")
        .plan(new MavenPerBranchDeployment()).after(buildGoals);

    sdm.addGoalContributions(goalContributors(
        onAnyPush().setGoals(checkGoals),
        whenPushSatisfies(IsMaven).setGoals(buildGoals),
        whenPushSatisfies(HasSpringBootPom, HasSpringBootApplicationClass, IsMaven).setGoals(deployGoals),
    ));

    sdm.addExtensionPacks(
        springSupport({
            inspectGoal: inspect,
            autofixGoal: autofix,
            review: {
                cloudNative: true,
                springStyle: true,
            },
            autofix: {},
            reviewListeners: [
            ],
        }),
        codeMetrics(),
    );

    sdm.addGeneratorCommand<SpringProjectCreationParameters>({
        name: "create-spring",
        intent: "create spring",
        description: "Create a new Java Spring Boot REST service",
        parameters: SpringProjectCreationParameterDefinitions,
        startingPoint: GitHubRepoRef.from({ owner: "Zeus-Cloud-Team", repo: "spring-rest", branch: "master" }),
        transform: [
            ReplaceReadmeTitle,
            SetAtomistTeamInApplicationYml,
            TransformSeedToCustomProject,
        ],
    });

    sdm.addGeneratorCommand<SpringProjectCreationParameters>({
        name: "funky-create-spring",
        intent: "funky create spring",
        description: "Create a new Java Spring Boot REST service, with funkiness",
        parameters: SpringProjectCreationParameterDefinitions,
        startingPoint: GitHubRepoRef.from({ owner: "Zeus-Cloud-Team", repo: "spring-rest", branch: "master" }),
        transform: [
            ReplaceReadmeTitle,
            SetAtomistTeamInApplicationYml,
            TransformSeedToCustomProject,
            CustomizeManifest,
        ],
    });

    sdm.addChannelLinkListener(async cli => {
        return cli.addressChannels("I see a new repo :wave:");
    });

    sdm.addCommand(ListBranchDeploys);

    // Manages a GitHub status check based on the current goals
    summarizeGoalsInGitHubStatus(sdm);

    return sdm;
}

/**
 * Customize the Cloud Foundry manifest to have the correct app name
 * @param {Project} p
 * @param {ParametersInvocation<SpringProjectCreationParameters>} ci
 * @return {Promise<void>}
 * @constructor
 */
const CustomizeManifest: CodeTransform<SpringProjectCreationParameters> = async (p, ci) => {
    const manifest = await p.getFile("manifest.yml");
    if (!manifest) {
        await ci.addressChannels(`This project has no Cloud Foundry manifest. The seed at ${p.id.url} is invalid`);
    }
    await manifest.replaceAll("funky-spring", ci.parameters.target.repoRef.repo);
    await ci.addressChannels(`Updating your manifest.yml`);
};
