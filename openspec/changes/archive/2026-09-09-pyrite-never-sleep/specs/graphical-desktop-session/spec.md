## ADDED Requirements

### Requirement: The laptop does not suspend itself when nobody is using it

The pyrite host SHALL NOT enter a suspended state on account of inactivity alone, whether the operator is at the login screen or in a desktop session, and whether the machine is running on mains power or on its battery.
A person SHALL remain able to suspend the host deliberately, and the host SHALL continue to blank and lock its panel after a period of inactivity, so that "does not suspend itself" does not mean "stays visible and unlocked".

**Discharged by**: world assumption `A13 — Resuming this laptop from a suspended state is unreliable, and recovering a failed resume requires a person at the machine`, which is what makes an unattended suspend a cost rather than a convenience.

This requirement is harm reduction and not a repair. It reduces how often the host takes the resume risk; it does not reduce the risk, which remains unexplained and is tracked separately.

#### Scenario: Nobody touches the machine at the login screen

- **WHEN** the host has reached its greeter and no person interacts with it for any length of time, on mains power or on battery
- **THEN** the host stays awake and remains reachable over the network, rather than suspending itself and requiring a person to be present to wake it

#### Scenario: Nobody touches the machine during a desktop session

- **WHEN** an operator is logged in to the desktop and stops interacting with it for any length of time, on mains power or on battery
- **THEN** the panel blanks and the session locks after the established period, and the host stays awake

#### Scenario: The operator suspends the machine on purpose

- **WHEN** an operator chooses to suspend the host, from the desktop or from a shell
- **THEN** the host suspends, unchanged by this requirement, and the operator accepts the resume risk knowingly on that occasion

#### Scenario: A person changes the power settings from the desktop's own settings panel

- **WHEN** a person sets an automatic-suspend policy through the desktop's settings panel
- **THEN** that person's choice takes effect over the declared fleet policy, because the fleet deliberately leaves these settings changeable at the machine
- **AND** the declared policy is therefore what the host does absent such a change, not a guarantee about what it does
