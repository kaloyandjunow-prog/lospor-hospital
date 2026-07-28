// Shared shapes used by the per-category OptionLibrary data files.
export interface TreeNode {
  v: string
  label: string
  labelBg?: string
  children?: TreeNode[]
}
