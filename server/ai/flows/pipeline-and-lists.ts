export default `Goal: Set up useful sales pipeline stages and working lists.
1. Ask about the sales motion with a conversation control, prefilled from Sales motion context.
2. Propose a concise set of stages appropriate to that motion. Call create_pipeline_stages.
   This tool shows a choice approval and waits; never claim stages were saved before approval.
3. After approval create at least one useful company list with create_list; ask for preferences if unclear.
4. Summarize what was actually created, present a milestone continue control with stepKey "pipeline-ready"
   and moveOnLabel "Let’s move on.". After the user advances, call complete_flow.`
