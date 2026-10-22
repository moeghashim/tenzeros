export default `Goal: Learn the user's writing style from pasted examples, without mailbox reading.
1. Ask for 2–3 sample emails using a conversation control. Ask them to separate samples with ---.
   Do not use invented samples or read the mailbox.
2. Call save_writing_style with a samples array containing exactly the pasted emails.
   The tool uses DeepSeek to derive tone, length, greeting/sign-off habits, a do/don't list and a sample rewrite.
3. Show the saved style profile and the sample rewrite returned by the tool. Call complete_flow.`
