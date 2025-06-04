#SingleInstance Force
DetectHiddenWindows(true)
SetTitleMatchMode(2)

ExpectedWindowTitle := A_Args[1]

if WinExist(ExpectedWindowTitle)
{
    hWnd := WinExist(ExpectedWindowTitle)
    if WinActive("ahk_id " hWnd) {
        WinActivate("ahk_id " hWnd)
    } else {
        MinMaxState := WinGetMinMax("ahk_id " hWnd)
        if (MinMaxState == -1) {
            WinRestore("ahk_id " hWnd)
        }
        WinActivate("ahk_id " hWnd)
    }
} else {
    ; Window not found logic (optional)
}
ExitApp()
