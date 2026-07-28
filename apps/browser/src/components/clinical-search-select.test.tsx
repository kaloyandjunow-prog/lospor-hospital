import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import {
  canonicalSearchValue,
  ClinicalSearchSelect,
} from "./clinical-search-select"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("clinical search select", () => {
  it("uses canonical codes for ICD and procedure results and INN for medication results", () => {
    expect(canonicalSearchValue("icd10", {
      code: "C61",
      label: "Malignant neoplasm of prostate",
    })).toBe("C61")
    expect(canonicalSearchValue("procedure", {
      code: "PROC-1",
      label: "Prostatectomy",
    })).toBe("PROC-1")
    expect(canonicalSearchValue("medication", {
      code: "N01AX10",
      label: "Propofol 10 mg/mL",
      inn: "Propofol",
      atcCode: "N01AX10",
    })).toBe("Propofol")
  })

  it("queries the existing API and emits the selected canonical value", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [{
        code: "C61",
        description: "Malignant neoplasm of prostate",
        system: "ICD-10",
      }],
    } as Response)
    const onChange = vi.fn()

    render(
      <ClinicalSearchSelect
        kind="icd10"
        endpoint="/search/icd10"
        locale="en"
        value=""
        onChange={onChange}
        searchLabel="Search clinical options"
        loadingLabel="Loading"
        noResultsLabel="No matching results"
        minimumLabel="Type at least {count} characters"
      />,
    )

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "C6" } })

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "/api/search/icd10?q=C6&locale=en",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      )
    })

    const option = await screen.findByRole("option", {
      name: /Malignant neoplasm of prostate/i,
    })
    fireEvent.click(option)
    expect(onChange).toHaveBeenCalledWith("C61")
  })
})
