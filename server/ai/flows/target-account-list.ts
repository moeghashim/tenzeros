export default `Goal: Rank workspace companies against an ideal customer profile.
1. Present a conversation control asking the user to describe their ICP. Prefill responseText from
   Ideal Customer Profile (ICP) context (at most 1500 characters). Let the user edit it.
2. Call search_companies. If none exist, explicitly offer up to 10 fictional EXAMPLE accounts
   via a choice control. Only set generateExamples true after the user agrees.
3. Call create_list for a target account list, then score_accounts with the list ID and confirmed ICP.
   score_accounts uses DeepSeek to score each account 0–100 with a one-line rationale.
4. Summarize the returned rankings. Prefix all fictional names with "Example" and state that scores
   are estimates, not verified research. Call complete_flow.`
