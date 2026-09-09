{
  clan.inventory.instances.omnigent = {
    module = {
      name = "omnigent";
      input = "self";
    };
    roles.server.machines.magnetite.settings.domain = "omni.scientistexperience.net";
    roles.host = {
      machines.magnetite.settings.environment = {
        PI_ACP_PI_COMMAND = "atomic";
        OMNIGENT_RUNNER_ENV_PASSTHROUGH = "PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR";
      };
      machines.pyrite.settings.environment = {
        PI_ACP_PI_COMMAND = "atomic";
        OMNIGENT_RUNNER_ENV_PASSTHROUGH = "PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR";
      };
      machines.stibnite.settings.environment = {
        PI_ACP_PI_COMMAND = "atomic";
        OMNIGENT_RUNNER_ENV_PASSTHROUGH = "PI_ACP_PI_COMMAND,PI_CODING_AGENT_DIR";
      };
      extraModules = [
        (
          { config, ... }:
          {
            services.omnigent-host.environment.PI_CODING_AGENT_DIR = "${
              config.users.users.${config.services.omnigent-host.user}.home
            }/.atomic/agent";
          }
        )
      ];
    };
  };
}
