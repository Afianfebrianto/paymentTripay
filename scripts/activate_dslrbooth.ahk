#Requires AutoHotkey v2.0
#SingleInstance Force

DetectHiddenWindows(true)
SetTitleMatchMode(2)

dslrBoothActualPath := "C:\Program Files\dslrBooth\dslrBooth.exe"

dslrBoothExeName := "dslrBooth.exe"
dslrBoothWindowTitleHint := "dslrBooth"

if (dslrBoothActualPath = "") {
    MsgBox("Path ke dslrBooth.exe tidak diberikan ke skrip AutoHotkey.", "Error", 16)
    ExitApp
}

PID := ProcessExist(dslrBoothExeName)

if (PID != 0) {
    targetWindowCriteria_PID := "ahk_pid " . PID
    targetWindowCriteria_Title := dslrBoothWindowTitleHint
    hWnd_PID := WinExist(targetWindowCriteria_PID)

    if (hWnd_PID) {
        MinMaxState := WinGetMinMax(hWnd_PID)
        if (MinMaxState = -1) {
            WinRestore(hWnd_PID)
        }
        WinActivate(hWnd_PID)
        ExitApp
    } else if (hWnd_Title := WinExist(targetWindowCriteria_Title)) {
        MinMaxState := WinGetMinMax(hWnd_Title)
        if (MinMaxState = -1) {
            WinRestore(hWnd_Title)
        }
        WinActivate(hWnd_Title)
        ExitApp
    } else {
        try {
            Run(dslrBoothActualPath)
            Sleep(2500)
            if WinWait(dslrBoothWindowTitleHint, , , 5) {
                WinActivate
            } else if WinExist("dslrBooth - Start") {
                WinActivate("dslrBooth - Start")
            } else {
                MsgBox("Jendela dslrBooth tidak ditemukan setelah dijalankan.", "Error", 16)
            }
        } catch {
            MsgBox("Gagal menjalankan ulang dslrBooth (proses ada, jendela tidak ditemukan).", "Error", 16)
        }
        ExitApp
    }
} else {
    try {
        Run(dslrBoothActualPath)
        Sleep(2500)
        if WinWait(dslrBoothWindowTitleHint, , , 5) {
            WinActivate
        } else if WinExist("dslrBooth - Start") {
            WinActivate("dslrBooth - Start")
        } else {
            MsgBox("Jendela dslrBooth tidak ditemukan setelah dijalankan.", "Error", 16)
        }
    } catch {
        MsgBox("Gagal menjalankan dslrBooth.", "Error", 16)
    }
    ExitApp
}
