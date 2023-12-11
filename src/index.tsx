import path from "path";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { format } from "date-fns";
import { useState, useEffect } from "react";
import {
  List,
  ActionPanel,
  Action,
  showToast,
  Toast,
  Icon,
  popToRoot,
} from "@raycast/api";

const TASKS_FILE = path.resolve(process.env.HOME ?? "", "./.tasks");

interface Task {
  date: string;
  type: string;
  content: string;
}

const executeCommand = (command: string) => {
  try {
    return execSync(command).toString();
  } catch (error) {
    console.error(`Error executing command: ${command}`, error);
    return "";
  }
};

const getLastTask = () => {
  if (existsSync(TASKS_FILE)) {
    const fileContent = readFileSync(TASKS_FILE, "utf8");
    const lines = fileContent.split("\n").filter(Boolean);
    const lastLine = lines[lines.length - 1];
    const [date, type, content] = lastLine.split(",");
    return { date, type, content };
  } else {
    return null;
  }
};

const getLastLoginTime = () => {
  const lastLoginStr = executeCommand("last | grep console | head -n 1");
  const match = lastLoginStr.match(/(\w{3}\s+\d+)\s+(\d{2}:\d{2})/);
  if (match) {
    const [, dateStr, timeStr] = match;
    const year = new Date().getFullYear();
    const formattedDateStr = `${dateStr} ${year} ${timeStr}`;
    return new Date(formattedDateStr);
  }
  return null;
};

const getLastLogoutTime = () => {
  const lastLogoutStr = executeCommand("last | grep console | awk 'NR==2'");
  const match = lastLogoutStr.match(
    /(\w{3}\s+\d+)\s+\d{2}:\d{2} - (\d{2}:\d{2}) \((\d+\+)?(\d{2}):(\d{2})\)/
  );
  if (match) {
    const [, dateStr, endTime, daysStr] = match;
    const year = new Date().getFullYear();
    const endDateStr = `${dateStr} ${year} ${endTime}`;
    const logoutTime = new Date(endDateStr);

    if (daysStr) {
      const days = parseInt(daysStr, 10);
      logoutTime.setDate(logoutTime.getDate() + 1 + days);
    }

    return logoutTime;
  }
  return null;
};

export default function Command() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState<string>("");

  useEffect(() => {
    if (existsSync(TASKS_FILE)) {
      const fileContent = readFileSync(TASKS_FILE, "utf8");
      const lines = fileContent
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [date, type, content] = line.split(",");
          return { date, type, content };
        });
      setTasks(lines);
    }
  }, []);

  const uniqueTypes = Array.from(new Set(tasks.map((task) => task.type))).sort(
    (a, b) => {
      const lastDateA = tasks
        .filter((task) => task.type === a)
        .sort((x, y) => y.date.localeCompare(x.date))[0]?.date;
      const lastDateB = tasks
        .filter((task) => task.type === b)
        .sort((x, y) => y.date.localeCompare(x.date))[0]?.date;
      return lastDateB.localeCompare(lastDateA);
    }
  );

  const filteredTypes = uniqueTypes.filter(
    (type) => type !== "login" && type !== "logout"
  );

  const uniqueContents = selectedType
    ? Array.from(
        new Set(
          tasks
            .filter((task) => task.type === selectedType)
            .map((task) => task.content)
        )
      ).sort((a, b) => {
        const lastDateA = tasks
          .filter((task) => task.content === a)
          .sort((x, y) => y.date.localeCompare(x.date))[0]?.date;
        const lastDateB = tasks
          .filter((task) => task.content === b)
          .sort((x, y) => y.date.localeCompare(x.date))[0]?.date;
        return lastDateB.localeCompare(lastDateA);
      })
    : [];

  const addTask = (type: string, content: string, date: Date | null = null) => {
    const taskDate = format(date || new Date(), "yyyy-MM-dd'T'HH:mm:ssXXX");
    writeFileSync(TASKS_FILE, `${taskDate},${type},${content}\n`, {
      flag: "a",
    });
  };

  const recordTask = (type: string, content: string) => {
    const lastTask = getLastTask();
    const lastTaskDate = lastTask ? new Date(lastTask.date) : new Date(0);
    const lastLoginTime = getLastLoginTime();
    const lastLogoutTime = getLastLogoutTime();

    const isNewTaskOrLogin =
      !lastTask ||
      lastTask.type !== type ||
      lastTask.content !== content ||
      (lastLoginTime && lastLoginTime > lastTaskDate);

    if (type !== "login" && type !== "logout") {
      if (lastLoginTime && lastLoginTime > lastTaskDate) {
        if (lastLogoutTime) {
          addTask("logout", "", lastLogoutTime as Date);
        }
        addTask("login", "", lastLoginTime as Date);
      }
    }

    if (isNewTaskOrLogin) {
      addTask(type, content);
      showToast(Toast.Style.Success, "Task added");
    } else {
      showToast(Toast.Style.Failure, "Task already in course");
    }
  };

  const handleTypeSelection = (type: string) => {
    setSelectedType(type);
    setInputValue("");
  };

  const handleContentSelection = (content: string) => {
    if (selectedType) {
      recordTask(selectedType.trim(), content.trim());
      popToRoot();
    }
  };

  const handleSubmit = () => {
    if (selectedType) {
      handleContentSelection(inputValue);
    } else {
      handleTypeSelection(inputValue);
    }
  };

  const inputValueExists = (input: string) => {
    if (selectedType) {
      return uniqueContents.includes(input);
    } else {
      return filteredTypes.includes(input);
    }
  };

  return (
    <List
      isLoading={tasks.length === 0}
      searchText={inputValue}
      selectedItemId={inputValue.trim() || undefined}
      onSearchTextChange={setInputValue}
      searchBarPlaceholder={
        selectedType
          ? "Enter task content or select from list"
          : "Enter task type or select from list"
      }
    >
      {inputValue.trim() && !inputValueExists(inputValue.trim()) && (
        <List.Item
          id={inputValue.trim()}
          title={`Add "${inputValue.trim()}"`}
          icon={Icon.Plus}
          actions={
            <ActionPanel>
              <Action title={`Add New`} onAction={handleSubmit} />
            </ActionPanel>
          }
        />
      )}
      {!selectedType
        ? filteredTypes.map((type) => (
            <List.Item
              key={type}
              id={type}
              title={type}
              actions={
                <ActionPanel>
                  <Action
                    title="Select Task Type"
                    onAction={() => handleTypeSelection(type)}
                  />
                  <Action
                    title="Edit Existing"
                    shortcut={{ modifiers: ["cmd"], key: "l" }}
                    onAction={() => setInputValue(type)}
                  />
                </ActionPanel>
              }
            />
          ))
        : uniqueContents.map((content) => (
            <List.Item
              key={content}
              id={content}
              title={content}
              actions={
                <ActionPanel>
                  <Action
                    title="Select Task Content"
                    onAction={() => handleContentSelection(content)}
                  />
                  <Action
                    title="Edit Existing"
                    shortcut={{ modifiers: ["cmd"], key: "l" }}
                    onAction={() => setInputValue(content)}
                  />
                </ActionPanel>
              }
            />
          ))}
    </List>
  );
}
