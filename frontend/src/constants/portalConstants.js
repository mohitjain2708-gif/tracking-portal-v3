export const INITIAL_FORM = {
  customer_name: "",
  container_input: "",
  bl_number: "",
  clearance_doc_number: "",
  do_date: "",
  document_status: "",
  original_docs_received_date: "",
};

export const INITIAL_MAPPING = {
  customer_name: "",
  container_number: "",
  bl_number: "",
};

export const INITIAL_GOOGLE_SHEET_STATE = {
  source_url: "",
  available_sheets: [],
  selected_sheet: "",
  sheet_title: "",
  source_context: null,
  temp_file_token: "",
};

export const INITIAL_PASSWORD_FORM = {
  current_password: "",
  new_password: "",
  confirm_password: "",
};

export const IMPORT_FILE_SIZE_LIMIT_MB = 10;

export const MOVEMENT_FILTERS = [
  { value: "All", label: "All" },
  { value: "Arrived Birgunj", label: "Arrived Birgunj" },
  { value: "On Rail", label: "On Rail" },
  { value: "At Port", label: "At Port" },
  { value: "Hi Seas", label: "Hi Seas" },
];

export const DOCUMENT_FIELDS = [
  ["invoice", "Invoice"],
  ["packing_list", "Packing List"],
  ["bl_copy", "BL Copy"],
];

export const DOCUMENT_STATUS_OPTIONS = ["", "Copy", "Original"];

export const STATUS_OPTIONS = ["active", "completed", "archived"];

export const SHIPMENT_STATUS_FILTERS = [
  { value: "all", label: "All Shipment Statuses" },
  { value: "action_needed", label: "Action Needed" },
  ...STATUS_OPTIONS.map((status) => ({
    value: status,
    label: status.charAt(0).toUpperCase() + status.slice(1),
  })),
];

export const MAPPING_FIELDS = [
  ["customer_name", "Customer Name"],
  ["container_number", "Container Number"],
  ["bl_number", "BL Number"],
];

export const MOVEMENT_PRIORITY = {
  "Arrived Birgunj": 4,
  "On Rail": 3,
  "At Port": 2,
  "Hi Seas": 1,
};

