"""Server-owned plan configuration; never read permissions from browser payloads.
Commercial feature differences are not yet defined: preserve existing features.
Edit this matrix to introduce reviewed plan differences without changing the UI.
"""
FEATURES=('dashboard','conversations','leads','export','booking','crm','voice','handoff','whatsapp')
PLAN_ENTITLEMENTS={plan:{feature:True for feature in FEATURES} for plan in ('demo','base','plus','advanced')}
CAPABILITY_FEATURE={'can_collect_leads':'leads','can_request_phone':'leads','can_request_email':'leads','can_book_appointments':'booking','can_modify_appointments':'booking','can_cancel_appointments':'booking','can_send_to_crm':'crm','can_use_voice':'voice','can_handoff_to_human':'handoff','can_use_whatsapp':'whatsapp'}
