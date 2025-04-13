import React, { useState, useEffect, memo } from 'react';
import { StyleSheet, View, Text, FlatList, Image, Switch, TouchableOpacity, Modal, Animated, ScrollView, Dimensions, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as MediaLibrary from 'expo-media-library';
import AsyncStorage from '@react-native-async-storage/async-storage';

const Tab = createBottomTabNavigator();
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PhotoItem = memo(({ item, selected, onPress, onLongPress, photoSize }) => {
  const scale = new Animated.Value(1);

  const animatePressIn = () => {
    Animated.spring(scale, { toValue: 0.95, useNativeDriver: true }).start();
  };

  const animatePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={animatePressIn}
      onPressOut={animatePressOut}
    >
      <Animated.Image
        source={{ uri: item.uri }}
        style={[
          styles.photo,
          { width: photoSize, height: photoSize },
          selected ? styles.selectedPhoto : null,
          { transform: [{ scale }] },
        ]}
        onError={() => console.log('Ошибка загрузки изображения:', item.id, item.uri)}
      />
    </TouchableOpacity>
  );
});

// Экран "Камера"
function CameraScreen({ showByDays, themeMode, updateDeletedCount, photoSize }) {
  const [photos, setPhotos] = useState([]);
  const [selectedPhotos, setSelectedPhotos] = useState([]);
  const [afterCursor, setAfterCursor] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);
  const isDark = themeMode === 'dark';

  const loadPhotos = async (isRefresh = false) => {
    setIsLoading(true);
    setErrorMessage(null);
    console.log('Начало загрузки фото, isRefresh:', isRefresh, 'afterCursor:', afterCursor);
    try {
      const permission = await MediaLibrary.getPermissionsAsync();
      console.log('Текущие разрешения:', permission.status);
      if (permission.status !== 'granted') {
        console.log('Разрешения не предоставлены, запрашиваем...');
        const { status } = await MediaLibrary.requestPermissionsAsync();
        console.log('Результат запроса разрешений:', status);
        if (status !== 'granted') {
          setErrorMessage('Нет доступа к галерее. Разрешите доступ в настройках устройства.');
          console.log('Нет доступа к галерее, пропускаем загрузку');
          return;
        }
      }

      const pageSize = 30;
      const fetchOptions = {
        mediaType: 'photo',
        sortBy: 'creationTime',
        first: pageSize,
      };
      if (isRefresh && afterCursor && typeof afterCursor === 'string') {
        fetchOptions.after = afterCursor;
      }
      console.log('Опции запроса:', fetchOptions);

      const { assets, endCursor, hasNextPage } = await MediaLibrary.getAssetsAsync(fetchOptions);
      console.log('Загружено за раз:', assets.length, 'endCursor:', endCursor, 'hasNextPage:', hasNextPage);

      const updatedAssets = await Promise.all(
        assets.map(async (asset) => {
          const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
          const uri = assetInfo.localUri || assetInfo.uri;
          return { ...asset, uri };
        })
      );

      const newPhotos = updatedAssets.filter(
        asset => !photos.some(p => p.id === asset.id)
      );

      setPhotos(prev => (isRefresh ? [...prev, ...newPhotos] : newPhotos));
      setAfterCursor(hasNextPage ? endCursor : null);
      setHasMore(hasNextPage && newPhotos.length > 0);
      console.log('Всего в состоянии:', isRefresh ? photos.length + newPhotos.length : newPhotos.length);
    } catch (error) {
      console.error('Ошибка загрузки:', error);
      if (error.message.includes("Couldn't find cursor") && isRefresh) {
        console.log('Ожидаемая ошибка курсора, используем обходной путь');
        const pageSize = 30;
        const fetchOptionsFallback = {
          mediaType: 'photo',
          sortBy: 'creationTime',
          first: pageSize + photos.length,
        };
        console.log('Опции запроса без курсора:', fetchOptionsFallback);
        const { assets, endCursor, hasNextPage } = await MediaLibrary.getAssetsAsync(fetchOptionsFallback);
        console.log('Загружено за раз без курсора:', assets.length);
        const updatedAssets = await Promise.all(
          assets.map(async (asset) => {
            const assetInfo = await MediaLibrary.getAssetInfoAsync(asset);
            const uri = assetInfo.localUri || assetInfo.uri;
            return { ...asset, uri };
          })
        );
        console.log('Обработаны assets:', updatedAssets.length);
        const newPhotos = updatedAssets.filter(
          asset => !photos.some(p => p.id === asset.id)
        );
        console.log('Отфильтровано новых фото:', newPhotos.length);
        setPhotos(prev => {
          const updatedPhotos = [...prev, ...newPhotos];
          console.log('Установлено новое состояние фото:', updatedPhotos.length);
          return updatedPhotos;
        });
        setAfterCursor(hasNextPage ? endCursor : null);
        setHasMore(hasNextPage && newPhotos.length > 0);
        console.log('Всего в состоянии после обхода:', photos.length + newPhotos.length);
        setErrorMessage(null);
      } else {
        setErrorMessage('Ошибка при загрузке фото. Попробуйте снова.');
      }
    } finally {
      console.log('Завершение загрузки');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    console.log('useEffect вызван');
    loadPhotos(false);
  }, []);

  const groupPhotos = () => {
    console.log('Группировка фото, всего:', photos.length);
    if (photos.length === 0) return [];
    const grouped = {};
    const months = [
      'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
    ];
    photos.forEach(photo => {
      const date = new Date(photo.creationTime);
      const day = date.getDate();
      const month = months[date.getMonth()];
      const year = date.getFullYear();
      const key = showByDays
        ? `${day} ${month} ${year} года`
        : `${month} ${year} года`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(photo);
    });
    return Object.entries(grouped).sort((a, b) => {
      const dateA = new Date(a[0].split(' ').reverse().join(' '));
      const dateB = new Date(b[0].split(' ').reverse().join(' '));
      return dateB - dateA;
    });
  };

  const deletePhotos = async () => {
    if (selectedPhotos.length === 0) return;
    try {
      const deletedPhotos = photos.filter(p => selectedPhotos.includes(p.id));
      await MediaLibrary.deleteAssetsAsync(selectedPhotos);
      setPhotos(photos.filter(p => !selectedPhotos.includes(p.id)));
      updateDeletedCount(selectedPhotos.length);
      setSelectedPhotos([]);
      console.log('Фото удалены:', selectedPhotos.length);
    } catch (error) {
      console.error('Ошибка удаления:', error);
      setErrorMessage('Ошибка при удалении фото.');
    }
  };

  const toggleSelection = (id) => {
    setSelectedPhotos(prev => 
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
  };

  const selectAllInGroup = (group) => {
    const groupIds = group.map(item => item.id);
    setSelectedPhotos(prev => {
      const allSelected = groupIds.every(id => prev.includes(id));
      if (allSelected) {
        return prev.filter(id => !groupIds.includes(id));
      } else {
        return [...new Set([...prev, ...groupIds])];
      }
    });
  };

  const showPreview = (photo) => {
    setPreviewPhoto(photo);
  };

  const hidePreview = () => {
    setPreviewPhoto(null);
  };

  const getNumColumns = () => {
    const padding = 5;
    const margin = 1;
    const availableWidth = SCREEN_WIDTH - padding * 2;
    const columns = Math.floor(availableWidth / (photoSize + margin * 2));
    return Math.max(columns, 1);
  };

  const renderPhoto = ({ item }) => (
    <PhotoItem
      item={item}
      selected={selectedPhotos.includes(item.id)}
      onPress={() => toggleSelection(item.id)}
      onLongPress={() => showPreview(item)}
      photoSize={photoSize}
    />
  );

  const renderGroup = ({ item: [key, group] }) => (
    <View style={styles.groupContainer}>
      <View style={styles.groupHeader}>
        <Text style={[styles.monthTitle, { color: isDark ? '#fff' : '#333' }]}>{key}</Text>
        <TouchableOpacity onPress={() => selectAllInGroup(group)}>
          <Text style={[styles.selectAllText, { color: isDark ? '#bbb' : '#666' }]}>
            {group.every(item => selectedPhotos.includes(item.id)) ? 'Отменить' : 'Выбрать все'}
          </Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={group}
        renderItem={renderPhoto}
        keyExtractor={item => item.id}
        numColumns={getNumColumns()}
        initialNumToRender={10}
        maxToRenderPerBatch={20}
        windowSize={10}
        key={`${photoSize}-${getNumColumns()}`}
        contentContainerStyle={styles.photoList}
      />
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.syncButton} onPress={() => loadPhotos(true)}>
          <Icon name="sync" size={24} color={isDark ? '#bbb' : '#666'} />
          <Text style={{ color: isDark ? '#bbb' : '#666' }}>Обновить</Text>
        </TouchableOpacity>
      </View>
      {selectedPhotos.length > 0 && (
        <TouchableOpacity style={styles.deleteButton} onPress={deletePhotos}>
          <Text style={styles.deleteText}>Удалить ({selectedPhotos.length})</Text>
        </TouchableOpacity>
      )}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={isDark ? '#bbb' : '#666'} />
          <Text style={{ color: isDark ? '#fff' : '#333', marginTop: 10 }}>Загрузка...</Text>
        </View>
      ) : errorMessage ? (
        <Text style={[styles.monthTitle, { color: isDark ? '#fff' : '#333', textAlign: 'center' }]}>{errorMessage}</Text>
      ) : photos.length === 0 ? (
        <Text style={[styles.monthTitle, { color: isDark ? '#fff' : '#333', textAlign: 'center' }]}>Нет фото</Text>
      ) : (
        <FlatList
          data={groupPhotos()}
          keyExtractor={([key]) => key}
          renderItem={renderGroup}
          initialNumToRender={5}
          maxToRenderPerBatch={10}
          windowSize={10}
          contentContainerStyle={styles.flatListContent}
        />
      )}
      {hasMore && photos.length > 0 && !isLoading && !errorMessage && (
        <TouchableOpacity style={styles.loadMoreButton} onPress={() => loadPhotos(true)}>
          <Text style={{ color: isDark ? '#bbb' : '#666' }}>Загрузить ещё</Text>
        </TouchableOpacity>
      )}
      <Modal
        visible={!!previewPhoto}
        transparent={true}
        onRequestClose={hidePreview}
      >
        <TouchableOpacity style={styles.previewContainer} onPress={hidePreview}>
          {previewPhoto && (
            <Image
              source={{ uri: previewPhoto.uri }}
              style={styles.previewImage}
              resizeMode="contain"
            />
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// Экран "Настройки"
function SettingsScreen({ setShowByDays, showByDays, setThemeMode, themeMode, deletedCount, setDeletedCount, setPhotoSize, photoSize }) {
  const toggleTheme = (mode) => setThemeMode(mode);
  const isDark = themeMode === 'dark';

  const selectPhotoSize = async (size) => {
    setPhotoSize(size);
    try {
      await AsyncStorage.setItem('photoSize', size.toString());
      console.log('Размер фото сохранён:', size);
    } catch (error) {
      console.error('Ошибка сохранения размера:', error);
    }
  };

  const resetDeletedCount = async () => {
    setDeletedCount(0);
    try {
      await AsyncStorage.setItem('deletedCount', '0');
      console.log('Статистика сброшена');
    } catch (error) {
      console.error('Ошибка сброса статистики:', error);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.screen, { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' }]}>
      <Text style={[styles.appInfo, { color: isDark ? '#fff' : '#333' }]}>FotDelete v0.3.8</Text>
      <Text style={[styles.statText, { color: isDark ? '#fff' : '#333' }]}>
        Удалено фото: {deletedCount}
      </Text>
      <TouchableOpacity style={styles.resetButton} onPress={resetDeletedCount}>
        <Text style={styles.resetText}>Сбросить статистику</Text>
      </TouchableOpacity>
      <View style={styles.settingRow}>
        <Text style={[styles.settingText, { color: isDark ? '#fff' : '#333' }]}>Показывать группы по дням</Text>
        <Switch value={showByDays} onValueChange={setShowByDays} />
      </View>
      <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#333' }]}>Размер фото</Text>
      <TouchableOpacity style={styles.themeOption} onPress={() => selectPhotoSize(80)}>
        <Text style={[styles.themeText, { color: isDark ? '#fff' : '#333' }, photoSize === 80 && styles.selectedTheme]}>Маленький (80x80)</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.themeOption} onPress={() => selectPhotoSize(100)}>
        <Text style={[styles.themeText, { color: isDark ? '#fff' : '#333' }, photoSize === 100 && styles.selectedTheme]}>Средний (100x100)</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.themeOption} onPress={() => selectPhotoSize(120)}>
        <Text style={[styles.themeText, { color: isDark ? '#fff' : '#333' }, photoSize === 120 && styles.selectedTheme]}>Большой (120x120)</Text>
      </TouchableOpacity>
      <Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#333' }]}>Тема</Text>
      <TouchableOpacity style={styles.themeOption} onPress={() => toggleTheme('light')}>
        <Icon name="light-mode" size={24} color={themeMode === 'light' ? '#333' : '#666'} />
        <Text style={[styles.themeText, { color: isDark ? '#fff' : '#333' }, themeMode === 'light' && styles.selectedTheme]}>Светлая</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.themeOption} onPress={() => toggleTheme('dark')}>
        <Icon name="dark-mode" size={24} color={themeMode === 'dark' ? '#bbb' : '#666'} />
        <Text style={[styles.themeText, { color: isDark ? '#fff' : '#333' }, themeMode === 'dark' && styles.selectedTheme]}>Тёмная</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// Главный компонент
export default function App() {
  const [showByDays, setShowByDays] = useState(false);
  const [themeMode, setThemeMode] = useState('dark');
  const [deletedCount, setDeletedCount] = useState(0);
  const [photoSize, setPhotoSize] = useState(100);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const storedCount = await AsyncStorage.getItem('deletedCount');
        if (storedCount !== null) {
          setDeletedCount(parseInt(storedCount, 10));
        }
        const storedSize = await AsyncStorage.getItem('photoSize');
        if (storedSize !== null) {
          setPhotoSize(parseInt(storedSize, 10));
        }
      } catch (error) {
        console.error('Ошибка загрузки настроек:', error);
      }
    };
    loadSettings();
  }, []);

  const updateDeletedCount = async (count) => {
    const newCount = deletedCount + count;
    setDeletedCount(newCount);
    try {
      await AsyncStorage.setItem('deletedCount', newCount.toString());
      console.log('Статистика сохранена:', newCount);
    } catch (error) {
      console.error('Ошибка сохранения статистики:', error);
    }
  };

  const isDark = themeMode === 'dark';

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ color, size }) => {
            let iconName;
            if (route.name === 'Camera') iconName = 'photo-camera';
            else if (route.name === 'Settings') iconName = 'settings';
            return <Icon name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: isDark ? '#bbb' : '#333',
          tabBarInactiveTintColor: '#666',
          tabBarStyle: { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' },
          headerStyle: { backgroundColor: isDark ? '#1a1a1a' : '#f5f5f5' },
          headerTintColor: isDark ? '#fff' : '#333',
        })}
      >
        <Tab.Screen name="Camera">
          {() => <CameraScreen showByDays={showByDays} themeMode={themeMode} updateDeletedCount={updateDeletedCount} photoSize={photoSize} />}
        </Tab.Screen>
        <Tab.Screen name="Settings">
          {() => <SettingsScreen 
            setShowByDays={setShowByDays} 
            showByDays={showByDays} 
            setThemeMode={setThemeMode} 
            themeMode={themeMode} 
            deletedCount={deletedCount} 
            setDeletedCount={setDeletedCount}
            setPhotoSize={setPhotoSize}
            photoSize={photoSize}
          />}
        </Tab.Screen>
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    padding: 5,
  },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'flex-end', 
    marginBottom: 10,
  },
  syncButton: { 
    padding: 5, 
    flexDirection: 'row', 
    alignItems: 'center',
  },
  photo: { 
    margin: 1,
    opacity: 1,
  },
  selectedPhoto: { 
    borderWidth: 2, 
    borderColor: 'red',
    opacity: 1,
  },
  monthTitle: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    marginVertical: 5,
  },
  groupContainer: {
    marginBottom: 10,
  },
  groupHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginVertical: 5,
  },
  selectAllText: { 
    fontSize: 14, 
    padding: 5,
  },
  deleteButton: { 
    backgroundColor: 'red', 
    padding: 10, 
    borderRadius: 5, 
    marginBottom: 10,
  },
  deleteText: { 
    color: '#fff', 
    textAlign: 'center',
  },
  appInfo: { 
    fontSize: 20, 
    fontWeight: 'bold', 
    textAlign: 'center', 
    marginVertical: 10,
  },
  statText: { 
    fontSize: 16, 
    textAlign: 'left', 
    marginBottom: 15,
  },
  resetButton: { 
    backgroundColor: '#ff4444', 
    padding: 10, 
    borderRadius: 5, 
    marginBottom: 20,
  },
  resetText: { 
    color: '#fff', 
    textAlign: 'center', 
    fontSize: 16,
  },
  settingRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    marginVertical: 10,
  },
  settingText: { 
    fontSize: 16,
  },
  sectionTitle: { 
    fontSize: 18, 
    fontWeight: 'bold', 
    marginTop: 20, 
    marginBottom: 10,
  },
  themeOption: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginVertical: 10,
  },
  themeText: { 
    fontSize: 16, 
    marginLeft: 10,
  },
  selectedTheme: { 
    fontWeight: 'bold',
  },
  loadMoreButton: { 
    padding: 10, 
    alignItems: 'center', 
    marginVertical: 10,
  },
  previewContainer: { 
    flex: 1, 
    backgroundColor: 'rgba(0,0,0,0.8)', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  previewImage: { 
    width: '90%', 
    height: '80%',
  },
  photoList: { 
    paddingBottom: 10,
  },
  flatListContent: {
    paddingBottom: 20,
  },
  loadingContainer: { 
    flex: 1, 
    justifyContent: 'center', 
    alignItems: 'center',
  },
});