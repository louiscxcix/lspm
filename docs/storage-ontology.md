# Shared factory storage

Storage is a Resource with resourceKind=facility, not a manufacturing step or production line.

- Material / intermediate Storage: storageRole=material_intermediate. Receives from Starpro (external Organization) and SMT (internal Resource/line). Madian manages it. Excludes SMT input waiting, finished goods and NG units.
- Packed goods / dispatch staging: storageRole=packed_dispatch. Receives packed finished goods after Packing. No manager or outbound destination confirmed.

Relations: receives_from (location → origin), manages (Person → location), stored_at (Part/Component → location), transfers_to (step → location or location → confirmed next step/location). A stored_at link is not a stock count. NG storage remains distinct.

Inventory observations can use Event → records_on → location and Event → records_on → Part, with sourceEntityId, lotCode, quantityUnit, occurredAt and recordedAt. Numerical inventory import and reconciliation are not implemented by this update; no fabricated quantities, lots or item-specific supplier links are created. Future quantity records must distinguish snapshots from movements to avoid double-counting.

Production maps show shared locations for populated line routes. Empty Nexlide/TEM/SMT maps stay empty. Packing output links to dispatch staging; unknown material-to-production destinations are not inferred.
