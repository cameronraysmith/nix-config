{
  flake.lib.omnigentACP.agents = [
    {
      name = "Atomic";
      command = "bunx pi-acp@0.0.33";
      omnigent_mcp = false;
      inject_system_prompt = false;
      env_passthrough = [
        "PI_ACP_PI_COMMAND"
        "PI_CODING_AGENT_DIR"
      ];
    }
  ];
}
