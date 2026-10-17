# Project password access

The deployed app keeps the existing owner password login. No Google popup is needed. Owner mode loads the private workspace and can manage project viewer access.

## Use

1. Open **내 전용**, enter the owner password, and open the project.
2. Use **프로젝트 접속 설정** or request a change in this chat. Viewer passwords support four or more characters. Short PINs use a project-specific Firebase credential prefix; this does not strengthen the PIN. The field is masked and the password is never saved in project documents.
3. Share the project link and its password. The viewer can only read that project's published view. Writes, other locked projects and private chat/History sources are denied.
4. Saving a new password revokes the previous viewer UID. Leave the password blank only when deliberately making the sanitized view public; the settings dialog asks for confirmation.

New projects can set a viewer password directly in the creation form. Cloud-created empty projects appear in the shared owner workspace, but are not automatically copied into local SQLite.

Viewer access uses a generated Firebase password account hidden behind the UI, not the viewer's personal Google account. All people sharing a project password share that account; individual attribution is unavailable.

Views are sanitized publications, not live private database reads. Saving access settings republishes the current view. Teams ingestion and automatic view refreshing from an external workbook remain separate work. Existing LS public production access stays available until explicitly locked; SMT/MOBIS need an owner-set viewer password before sharing.

## Production day

SMT charts always display 24 hourly intervals: 07:00–19:00, then 19:00–next day 07:00, America/Mexico_City. Records after midnight and before 07:00 belong to the preceding production day. Missing hours stay missing rather than zero. Totals are labeled recorded intervals, not an inferred complete shift. Reports still use their actual calendar report date: 9am means 08:00–09:00.

## Verification and limits

142 local regression tests pass. Live Firebase checks cover own-project read, anonymous/cross-project/private-seed denial, viewer write denial, permission escalation denial and revoked account denial. Project catalog contains names and generated login aliases only; Hosting no longer contains full project graphs. These are prototype Security Rules designed for least-privilege project access; review and harden them before broad distribution. Previously downloaded public content cannot be recalled. Owner credentials were not used in the live UI test.
