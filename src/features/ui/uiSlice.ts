import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface UIState {
  categoryMappingsOpen: boolean;
  categoryMappingsFilterGroup: string | null;
  categoryMappingsSearch: string;
  categoryMappingsShowUnmapped: boolean;
}

const initialState: UIState = {
  categoryMappingsOpen: false,
  categoryMappingsFilterGroup: null,
  categoryMappingsSearch: "",
  categoryMappingsShowUnmapped: false,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    setCategoryMappingsOpen(state, action: PayloadAction<boolean>) {
      state.categoryMappingsOpen = action.payload;
    },
    setCategoryMappingsFilterGroup(state, action: PayloadAction<string | null>) {
      state.categoryMappingsFilterGroup = action.payload;
    },
    setCategoryMappingsSearch(state, action: PayloadAction<string>) {
      state.categoryMappingsSearch = action.payload;
    },
    setCategoryMappingsShowUnmapped(state, action: PayloadAction<boolean>) {
      state.categoryMappingsShowUnmapped = action.payload;
    },
  },
});

export const {
  setCategoryMappingsOpen,
  setCategoryMappingsFilterGroup,
  setCategoryMappingsSearch,
  setCategoryMappingsShowUnmapped,
} = uiSlice.actions;

export default uiSlice.reducer;
