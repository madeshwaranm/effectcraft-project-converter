-- EffectCraft Project Converter: drop projects on this app to convert them, saved next to the
-- originals.
--   EffectCraft (.ecproj) -> Adobe After Effects (.aep)
--   Adobe After Effects (.aep, .aepx) -> EffectCraft (.ecproj)
-- Double-click it to pick files instead. app/build.js fills in the two paths below and
-- compiles this into the app.

property nodePath : "__NODE__"
property cliPath : "__CLI__"

on run
	try
		set picked to choose file with prompt "Choose projects to convert (EffectCraft .ecproj or After Effects .aep):" with multiple selections allowed
	on error number -128
		return
	end try
	showResult(convertFiles(picked))
end run

on open droppedItems
	showResult(convertFiles(droppedItems))
end open

-- Converts the projects among theFiles. Returns {report text, last saved .aep path, failure count},
-- or missing value when there was nothing to convert.
on convertFiles(theFiles)
	set projects to {}
	repeat with f in theFiles
		set p to POSIX path of f
		if p ends with ".ecproj" or p ends with ".aep" or p ends with ".aepx" then set end of projects to p
	end repeat
	if projects is {} then return missing value

	set progress total steps to (count of projects)
	set progress completed steps to 0
	set progress description to "Converting…"

	set report to ""
	set lastSaved to ""
	set failures to 0
	repeat with i from 1 to count of projects
		set p to item i of projects
		set progress additional description to "Converting " & (do shell script "basename " & quoted form of p)
		try
			set out to do shell script quoted form of nodePath & " " & quoted form of cliPath & " " & quoted form of p & " 2>&1"
			repeat with ln in paragraphs of out
				if ln starts with "Saved " then set lastSaved to text 7 thru -1 of ln
			end repeat
			set report to report & out & return & return
		on error errMsg
			set failures to failures + 1
			set report to report & "Couldn't convert " & p & ":" & return & errMsg & return & return
		end try
		set progress completed steps to i
	end repeat
	return {report, lastSaved, failures}
end convertFiles

on showResult(r)
	if r is missing value then
		display alert "Nothing to convert" message "Drop EffectCraft projects (.ecproj) or After Effects projects (.aep, .aepx) on this app." as warning
		return
	end if
	set {report, lastSaved, failures} to r
	set report to my trimLines(report, 24)
	if lastSaved is "" then
		display alert "Conversion failed" message report as critical
	else
		set titleText to "Done"
		if failures > 0 then set titleText to "Done, with " & failures & " failed"
		set choice to button returned of (display dialog report with title titleText buttons {"Show in Finder", "OK"} default button "OK")
		if choice is "Show in Finder" then do shell script "open -R " & quoted form of lastSaved
	end if
end showResult

-- Keep the dialog a readable size.
on trimLines(t, maxLines)
	set ls to paragraphs of t
	if (count of ls) ≤ maxLines then return t
	set AppleScript's text item delimiters to return
	set shortText to (items 1 thru maxLines of ls) as text
	set AppleScript's text item delimiters to ""
	return shortText & return & "… (more in Terminal: node bin/convert.js <file> shows the full list)"
end trimLines
