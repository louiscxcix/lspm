# History actions and customer TEM routes

## History versus Progress

Business History records meaningful disruptions, risks, responses/actions, resolutions, changes, requests, decisions, progress/results, inspections and communications. The default map filter prioritizes actionable records; users can choose all business history or a specific category. A response is not automatically a resolution. Planned work is not completed work.

WIP uploads create `recordClass: production_log` records with source text and immutable quantity snapshots. These records remain accessible as Progress evidence, but are excluded from business History lists and map counts. Existing cloud uploads are projected through the same classification without deleting uploaded documents. Current local DB had no WIP records requiring migration. Counts, timestamps, source text and retries remain intact.

New kinds: `risk`, `response`, `resolution`. Manual review supports importance (`normal`, `attention`, `critical`) and follow-up links. Extraction separates pure WIP tables and routine acknowledgements from business events. Event storage never automatically changes routes, assignments, inventory or Risk status.

Map badge colors aggregate all matching records, including those outside the first page: critical red, attention/disruption/risk amber, resolution green, ordinary blue. They describe records within the selected period, not the current state of a machine or proof every issue is resolved. A resolution does not suppress earlier urgent records in the same range. Labels and tooltips explain meaning beyond color.

## MOBIS + HELLA

The merged project now includes two separate 20-stage TEM routes: BL7m PE P on Line1 and P768 A-2 on Line2. The user approved temporary reuse of the observed BiLED sequence. These are provisional customer routes, not verified production specifications. Their context and `routeAssumption` flag retain this limitation.

Separate customer component categories and equipment-family requirements connect to consuming/producing stages. These are not physical machine instances, confirmed customer BOMs, inventory or capability assertions. No equipment model, serial number, capacity, component quantity or completion was fabricated. The original observed Flex-N-Gate BiLED route and LS memberships remain unchanged.

Confirmed TEM people and role groups are reused by ID. The project includes manager Hector Garrido, supervisor Miguel Angel Vega, leaders Samuel Luna and Ana Karen Ramirez, the five named technicians, and the existing reporting chain. Processes connect to their allocated line and TEM area; people remain line-level contacts, never assigned automatically to individual stations. Known leader/supervisor escalation and technician reporting relationships are retained. Operator quantities are historical staffing observations, not invented named operators.

`update-customer-tem.js` is idempotent in graph changes, creates a SQLite backup before applying, validates both graphs, and saves with revision checks. Deployment updates the private seed and public application separately; raw History/Kakao sources remain outside public Hosting assets.
