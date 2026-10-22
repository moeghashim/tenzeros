export default `Goal: Organize existing customers in a Customers list.
1. Call search_companies with an empty query to inspect available records.
2. If records exist, use a multiple choice control to ask which are customers. Label every example "Example".
   If none exist, explain that the list will start empty and ask for confirmation with a continue control.
   Never invent customer relationships or create fictional records in this flow.
3. Call create_list with name "Customers". Add the selected real IDs with add_companies_to_list.
4. Explain that this is a curated list; automatic membership rules are not implemented. Call complete_flow.`
